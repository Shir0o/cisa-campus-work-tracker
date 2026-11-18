/**
 * Admin-SDK backend, for the stdio and Streamable HTTP transports.
 *
 * The Admin SDK bypasses `firestore.rules`, which is required because an MCP
 * client has no signed-in Firebase user. That is why the tool set is
 * deliberately narrow and every write is appended to `mcp_audit_logs`.
 *
 * Credentials, in order of precedence:
 *   1. `FIREBASE_SERVICE_ACCOUNT` — inline JSON or a path to the JSON file.
 *   2. `GOOGLE_APPLICATION_CREDENTIALS` — a path to the JSON file.
 *   3. Application Default Credentials (e.g. a Cloud Run service identity).
 *
 * `MCP_BACKEND=memory` swaps in the in-memory backend; it exists for tests and
 * offline protocol checks and refuses to run with `NODE_ENV=production`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process, { env } from 'node:process';
import type { DocumentSnapshot as AdminDocumentSnapshot, Query as AdminQuery } from 'firebase-admin/firestore';
import type {
  CollectionQuery,
  FirestoreBackend,
  FirestoreData,
  FirestoreDoc,
} from './backend.ts';
import { MemoryBackend } from './memory.ts';

export type {
  CollectionQuery,
  FirestoreBackend,
  FirestoreData,
  FirestoreDoc,
  TransactionContext,
} from './backend.ts';

export const DEFAULT_PROJECT_ID = 'sac-campus-hub';
export const DEFAULT_DATABASE_ID = 'prod';

const ADMIN_APP_NAME = 'cisa-work-tracker-mcp';
/** mcp/src/firestore.ts → repository root. */
const APPLET_CONFIG_PATH = fileURLToPath(
  new URL('../../firebase-applet-config.json', import.meta.url)
);

interface ServiceAccountJson {
  project_id?: string;
  client_email: string;
  private_key: string;
}

interface AppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

function readAppletConfig(): AppletConfig {
  try {
    return JSON.parse(readFileSync(APPLET_CONFIG_PATH, 'utf8')) as AppletConfig;
  } catch {
    return {};
  }
}

function parseServiceAccount(raw: string): ServiceAccountJson {
  const trimmed = raw.trim();
  let jsonText: string;

  if (trimmed.startsWith('{')) {
    jsonText = trimmed;
  } else {
    const path = resolve(trimmed);
    try {
      jsonText = readFileSync(path, 'utf8');
    } catch {
      throw new Error(
        `Could not read the Firebase service account file at "${path}". ` +
          'Set FIREBASE_SERVICE_ACCOUNT to a JSON string or an absolute path to the JSON file.'
      );
    }
  }

  let parsed: Partial<ServiceAccountJson>;
  try {
    parsed = JSON.parse(jsonText) as Partial<ServiceAccountJson>;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS is not valid JSON.');
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('The service account JSON must contain "client_email" and "private_key".');
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

function resolveServiceAccount(): ServiceAccountJson | null {
  const inline = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (inline) return parseServiceAccount(inline);

  const adcPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (adcPath) return parseServiceAccount(adcPath);

  return null;
}

async function createAdminBackend(
  serviceAccount: ServiceAccountJson | null,
  projectId: string,
  databaseId: string
): Promise<FirestoreBackend> {
  const adminApp = await import('firebase-admin/app');
  const adminFirestore = await import('firebase-admin/firestore');

  const app =
    adminApp.getApps().find((candidate) => candidate.name === ADMIN_APP_NAME) ??
    adminApp.initializeApp(
      {
        credential: serviceAccount
          ? adminApp.cert({
              projectId: serviceAccount.project_id ?? projectId,
              clientEmail: serviceAccount.client_email,
              privateKey: serviceAccount.private_key,
            })
          : adminApp.applicationDefault(),
        projectId,
      },
      ADMIN_APP_NAME
    );

  const db =
    databaseId === '(default)'
      ? adminFirestore.getFirestore(app)
      : adminFirestore.getFirestore(app, databaseId);

  const toDoc = (snapshot: AdminDocumentSnapshot): FirestoreDoc => ({
    id: snapshot.id,
    data: (snapshot.data() ?? {}) as FirestoreData,
  });

  return {
    mode: 'service-account',
    projectId,
    databaseId,

    async getDoc(path) {
      const snapshot = await db.doc(path).get();
      return snapshot.exists ? toDoc(snapshot) : null;
    },

    async getDocsWhere(collectionPath, field, value, max = 10) {
      const snapshot = await db.collection(collectionPath).where(field, '==', value).limit(max).get();
      return snapshot.docs.map(toDoc);
    },

    async listCollection(collectionPath, options: CollectionQuery = {}) {
      let query: AdminQuery = db.collection(collectionPath);
      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.direction ?? 'asc');
      }
      if (options.limit) query = query.limit(options.limit);
      const snapshot = await query.get();
      return snapshot.docs.map(toDoc);
    },

    async addDoc(collectionPath, data) {
      const docRef = await db.collection(collectionPath).add(data);
      return docRef.id;
    },

    runTransaction(worker) {
      return db.runTransaction(async (transaction) =>
        worker({
          async get(path) {
            const snapshot = await transaction.get(db.doc(path));
            return snapshot.exists ? toDoc(snapshot) : null;
          },
          update(path, data) {
            transaction.update(db.doc(path), data);
          },
          set(path, data) {
            transaction.set(db.doc(path), data);
          },
        })
      );
    },

    serverTimestamp() {
      return adminFirestore.FieldValue.serverTimestamp();
    },
  };
}

/**
 * Creates the Firestore backend selected by the environment.
 *
 * `MCP_BACKEND=memory` is only for tests and the offline `smoke` check; it is
 * rejected in production so a misconfigured deployment cannot silently start
 * with an empty database.
 */
export async function createBackend(): Promise<FirestoreBackend> {
  if (env.MCP_BACKEND?.trim() === 'memory') {
    if (env.NODE_ENV === 'production') {
      throw new Error('MCP_BACKEND=memory is not allowed with NODE_ENV=production.');
    }
    return new MemoryBackend();
  }

  const applet = readAppletConfig();
  const projectId = env.FIREBASE_PROJECT_ID?.trim() || applet.projectId || DEFAULT_PROJECT_ID;
  const databaseId =
    env.FIREBASE_DATABASE_ID?.trim() || applet.firestoreDatabaseId || DEFAULT_DATABASE_ID;

  const serviceAccount = resolveServiceAccount();
  if (!serviceAccount && !env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    logToStderr(
      '[cisa-work-tracker-mcp] No service-account credential found; falling back to ' +
        'Application Default Credentials. Set FIREBASE_SERVICE_ACCOUNT or ' +
        'GOOGLE_APPLICATION_CREDENTIALS if the first Firestore call fails.'
    );
  }

  return createAdminBackend(serviceAccount, projectId, databaseId);
}

export function logToStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}
