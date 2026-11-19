/**
 * Firestore REST store, for the Cloudflare Worker (`mcp/worker`).
 *
 * `firebase-admin` cannot run in Workers (gRPC, Node built-ins), so this talks
 * to the Firestore REST API with a service-account JWT signed through
 * WebCrypto. It implements the same {@link FirestoreBackend} the tools use over
 * stdio and Streamable HTTP, including the named database (`prod`) and real
 * `:beginTransaction` / `:commit` transactions.
 */
import type {
  CollectionQuery,
  FirestoreBackend,
  FirestoreData,
  FirestoreDoc,
  TransactionContext,
} from './backend.ts';

export const FIRESTORE_HOST = 'https://firestore.googleapis.com/v1';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';
const MAX_TRANSACTION_ATTEMPTS = 3;
const DEFAULT_DATABASE_ID = '(default)';

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface RestStoreOptions {
  projectId: string;
  databaseId: string;
  serviceAccount: ServiceAccount;
}

// ─── Firestore REST value codec ─────────────────────────────────────────────

export type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values: FsValue[] } }
  | { mapValue: { fields: Record<string, FsValue> } };

/** Marker for `FieldValue.serverTimestamp()`, resolved when writes are built. */
const SERVER_TIMESTAMP = Symbol('serverTimestamp');

export function encodeValue(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: encodeData(value as FirestoreData).fields } };
}

export function decodeValue(value: FsValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  return decodeFields(value.mapValue.fields ?? {});
}

export function decodeFields(fields: Record<string, FsValue>): FirestoreData {
  const out: FirestoreData = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

/**
 * Splits a document map into plain REST fields plus the dotted field paths that
 * need a `REQUEST_TIME` transform, which is how a server timestamp is written.
 */
export function encodeData(
  data: FirestoreData,
  prefix = ''
): { fields: Record<string, FsValue>; transforms: string[] } {
  const fields: Record<string, FsValue> = {};
  const transforms: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === SERVER_TIMESTAMP) {
      transforms.push(path);
      continue;
    }
    if (isPlainObject(value)) {
      const nested = encodeData(value, path);
      fields[key] = { mapValue: { fields: nested.fields } };
      transforms.push(...nested.transforms);
      continue;
    }
    fields[key] = encodeValue(value);
  }

  return { fields, transforms };
}

function isPlainObject(value: unknown): value is FirestoreData {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof Date) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// ─── Service-account auth ───────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
}

export async function signJwt(
  claims: Record<string, unknown>,
  privateKeyPem: string
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encoder = new TextEncoder();
  const signingInput = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(
    encoder.encode(JSON.stringify(claims))
  )}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const cached = tokenCache.get(serviceAccount.client_email);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: serviceAccount.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key
  );

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Service-account token exchange failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(serviceAccount.client_email, {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
  return body.access_token;
}

// ─── Store ──────────────────────────────────────────────────────────────────

class RetryableTransactionError extends Error {}

export class RestStore implements FirestoreBackend {
  readonly mode = 'service-account' as const;
  readonly projectId: string;
  readonly databaseId: string;

  private readonly serviceAccount: ServiceAccount;
  /** `projects/{p}/databases/{db}/documents`, the prefix for every resource name. */
  private readonly root: string;

  constructor(options: RestStoreOptions) {
    const { projectId, databaseId, serviceAccount } = options;
    if (!projectId) throw new Error('RestStore needs a Firebase project id.');
    if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
      throw new Error('Service account is missing client_email or private_key.');
    }
    this.projectId = projectId;
    this.databaseId = databaseId || DEFAULT_DATABASE_ID;
    this.serviceAccount = { ...serviceAccount, project_id: serviceAccount.project_id || projectId };
    this.root = `projects/${projectId}/databases/${encodeURIComponent(this.databaseId)}/documents`;
  }

  // ── Transport ──

  private async request(suffix: string, init?: RequestInit): Promise<Response> {
    const token = await getAccessToken(this.serviceAccount);
    return fetch(`${FIRESTORE_HOST}/${this.root}${suffix}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }

  private async readDocument(path: string, transaction?: string): Promise<FirestoreDoc | null> {
    const query = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
    const res = await this.request(`/${path}${query}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore read failed (${res.status}): ${await res.text()}`);
    const doc = (await res.json()) as { name: string; fields?: Record<string, FsValue> };
    return { id: docIdOf(doc.name), data: decodeFields(doc.fields ?? {}) };
  }

  private async runQuery(
    collectionPath: string,
    options: {
      where?: { field: string; value: unknown };
      orderBy?: string;
      direction?: 'asc' | 'desc';
      limit?: number;
    }
  ): Promise<FirestoreDoc[]> {
    const { parent, collectionId } = splitCollectionPath(collectionPath);
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] };
    if (options.where) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: options.where.field },
          op: 'EQUAL',
          value: encodeValue(options.where.value),
        },
      };
    }
    if (options.orderBy) {
      structuredQuery.orderBy = [
        {
          field: { fieldPath: options.orderBy },
          direction: options.direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
        },
      ];
    }
    if (options.limit) structuredQuery.limit = options.limit;

    const res = await this.request(':runQuery', {
      method: 'POST',
      body: JSON.stringify({
        parent: parent ? `${this.root}/${parent}` : this.root,
        structuredQuery,
      }),
    });
    if (!res.ok) throw new Error(`Firestore query failed (${res.status}): ${await res.text()}`);

    const rows = (await res.json()) as {
      document?: { name: string; fields?: Record<string, FsValue> };
    }[];
    return rows
      .filter(
        (row): row is { document: { name: string; fields?: Record<string, FsValue> } } =>
          Boolean(row.document)
      )
      .map((row) => ({
        id: docIdOf(row.document.name),
        data: decodeFields(row.document.fields ?? {}),
      }));
  }

  private buildWrites(
    path: string,
    data: FirestoreData,
    mask: boolean,
    requireNew = false
  ): Record<string, unknown>[] {
    const name = `${this.root}/${path}`;
    const { fields, transforms } = encodeData(data);

    const update: Record<string, unknown> = { update: { name, fields } };
    if (mask) update.updateMask = { fieldPaths: Object.keys(fields) };
    if (requireNew) update.currentDocument = { exists: false };

    const writes = [update];
    if (transforms.length > 0) {
      writes.push({
        transform: {
          document: name,
          fieldTransforms: transforms.map((fieldPath) => ({
            fieldPath,
            setToServerValue: 'REQUEST_TIME',
          })),
        },
      });
    }
    return writes;
  }

  private async beginTransaction(): Promise<string> {
    const res = await this.request(':beginTransaction', { method: 'POST', body: '{}' });
    if (!res.ok) {
      throw new Error(`Firestore beginTransaction failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as { transaction: string };
    return body.transaction;
  }

  private async commit(writes: Record<string, unknown>[], transaction?: string): Promise<void> {
    const res = await this.request(':commit', {
      method: 'POST',
      body: JSON.stringify(transaction ? { writes, transaction } : { writes }),
    });
    if (res.ok) return;

    const text = await res.text();
    // Contention aborts the transaction; the caller retries with a fresh one.
    if (res.status === 409 || (res.status === 400 && /ABORTED|FAILED_PRECONDITION/i.test(text))) {
      throw new RetryableTransactionError(text);
    }
    throw new Error(`Firestore commit failed (${res.status}): ${text}`);
  }

  // ── FirestoreBackend ──

  getDoc(path: string): Promise<FirestoreDoc | null> {
    return this.readDocument(path);
  }

  getDocsWhere(
    collectionPath: string,
    field: string,
    value: unknown,
    max = 10
  ): Promise<FirestoreDoc[]> {
    return this.runQuery(collectionPath, { where: { field, value }, limit: max });
  }

  listCollection(collectionPath: string, options: CollectionQuery = {}): Promise<FirestoreDoc[]> {
    return this.runQuery(collectionPath, {
      orderBy: options.orderBy,
      direction: options.direction,
      limit: options.limit,
    });
  }

  async addDoc(collectionPath: string, data: FirestoreData): Promise<string> {
    const id = crypto.randomUUID();
    const writes = this.buildWrites(`${collectionPath}/${id}`, data, false, true);
    await this.commit(writes);
    return id;
  }

  async runTransaction<T>(worker: (tx: TransactionContext) => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt++) {
      const transaction = await this.beginTransaction();
      const writes: Record<string, unknown>[] = [];
      const tx: TransactionContext = {
        get: (path) => this.readDocument(path, transaction),
        // A partial update must not replace the whole document, so mask the
        // fields the tool explicitly set.
        update: (path, data) => {
          writes.push(...this.buildWrites(path, data, true));
        },
        set: (path, data) => {
          writes.push(...this.buildWrites(path, data, false));
        },
      };

      const result = await worker(tx);
      try {
        await this.commit(writes, transaction);
        return result;
      } catch (error) {
        if (!(error instanceof RetryableTransactionError)) throw error;
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Firestore transaction aborted after retries.');
  }

  serverTimestamp(): unknown {
    return SERVER_TIMESTAMP;
  }
}

function docIdOf(name: string): string {
  const parts = name.split('/');
  return parts[parts.length - 1] ?? name;
}

/** `contacts/{id}/interactions` → parent `contacts/{id}`, collection `interactions`. */
function splitCollectionPath(collectionPath: string): { parent: string; collectionId: string } {
  const parts = collectionPath.split('/').filter(Boolean);
  const collectionId = parts.pop() ?? '';
  return { parent: parts.join('/'), collectionId };
}
