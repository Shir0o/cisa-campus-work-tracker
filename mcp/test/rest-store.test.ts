// REST transport tests: the Firestore value codec, the service-account JWT and
// the request shapes the Worker depends on. No network, no credentials.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FIRESTORE_HOST,
  RestStore,
  TOKEN_URL,
  decodeValue,
  encodeData,
  encodeValue,
  signJwt,
  type FsValue,
  type ServiceAccount,
} from '../src/rest-store.ts';

let privateKeyPem: string;

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;

  const pkcs8 = (await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)) as ArrayBuffer;
  const base64 = Buffer.from(pkcs8).toString('base64');
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
});

function serviceAccount(email: string): ServiceAccount {
  return { project_id: 'sac-campus-hub', client_email: email, private_key: privateKeyPem };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Firestore REST value codec', () => {
  it('round-trips the scalar types the tracker uses', () => {
    const values = ['hello', 90, 1.5, true, null, new Date('2026-11-02T10:00:00.000Z')];
    for (const value of values) {
      expect(decodeValue(encodeValue(value))).toEqual(value);
    }
  });

  it('encodes whole numbers as integers, not doubles', () => {
    expect(encodeValue(90)).toEqual({ integerValue: '90' });
    expect(encodeValue(1.5)).toEqual({ doubleValue: 1.5 });
  });

  it('round-trips nested maps and arrays', () => {
    const value = {
      attendance: { present: ['c1', 'c2'], absent: [] },
      when: new Date('2026-12-31T00:00:00.000Z'),
    };
    expect(decodeValue(encodeValue(value))).toEqual(value);
  });

  it('drops undefined fields instead of writing nulls', () => {
    const encoded = encodeValue({ a: 1, b: undefined }) as {
      mapValue: { fields: Record<string, FsValue> };
    };
    expect(Object.keys(encoded.mapValue.fields)).toEqual(['a']);
  });
});

describe('encodeData', () => {
  it('splits a server timestamp into a REQUEST_TIME transform, including nested fields', () => {
    const store = new RestStore({
      projectId: 'sac-campus-hub',
      databaseId: 'prod',
      serviceAccount: serviceAccount('sa-encode@example.iam.gserviceaccount.com'),
    });
    const { fields, transforms } = encodeData({
      title: 'Follow up',
      createdAt: store.serverTimestamp(),
      metadata: { updatedAt: store.serverTimestamp(), note: 'x' },
      missing: undefined,
    });

    expect(fields.title).toEqual({ stringValue: 'Follow up' });
    expect(fields.missing).toBeUndefined();
    expect(fields.metadata).toEqual({
      mapValue: { fields: { note: { stringValue: 'x' } } },
    });
    expect(transforms).toEqual(['createdAt', 'metadata.updatedAt']);
  });
});

describe('signJwt', () => {
  it('signs an RS256 JWT the matching public key verifies', async () => {
    const keyPair = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const pkcs8 = (await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)) as ArrayBuffer;
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8)
      .toString('base64')
      .match(/.{1,64}/g)!
      .join('\n')}\n-----END PRIVATE KEY-----\n`;

    const jwt = await signJwt({ iss: 'sa@example.iam.gserviceaccount.com', exp: 1 }, pem);
    const [header, claims, signature] = jwt.split('.');

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString()).iss).toBe(
      'sa@example.iam.gserviceaccount.com'
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      keyPair.publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${claims}`)
    );
    expect(valid).toBe(true);
  });
});

describe('RestStore requests', () => {
  it('reads a document from the named database and decodes timestamps', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url === TOKEN_URL) return jsonResponse({ access_token: 'token', expires_in: 3600 });
        if (url.endsWith('/documents/contacts/c1')) {
          return jsonResponse({
            name: 'projects/sac-campus-hub/databases/prod/documents/contacts/c1',
            fields: {
              name: { stringValue: 'Ada Lovelace' },
              updatedAt: { timestampValue: '2026-11-02T10:00:00.000Z' },
            },
          });
        }
        return new Response('not found', { status: 404 });
      })
    );

    const store = new RestStore({
      projectId: 'sac-campus-hub',
      databaseId: 'prod',
      serviceAccount: serviceAccount('sa-get@example.iam.gserviceaccount.com'),
    });
    const doc = await store.getDoc('contacts/c1');

    expect(doc?.id).toBe('c1');
    expect(doc?.data.name).toBe('Ada Lovelace');
    expect(doc?.data.updatedAt).toEqual(new Date('2026-11-02T10:00:00.000Z'));
    expect(urls).toContain(
      `${FIRESTORE_HOST}/projects/sac-campus-hub/databases/prod/documents/contacts/c1`
    );
    vi.unstubAllGlobals();
  });

  it('returns null for a missing document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === TOKEN_URL) {
          return jsonResponse({ access_token: 'token', expires_in: 3600 });
        }
        return new Response('', { status: 404 });
      })
    );

    const store = new RestStore({
      projectId: 'sac-campus-hub',
      databaseId: 'prod',
      serviceAccount: serviceAccount('sa-missing@example.iam.gserviceaccount.com'),
    });
    expect(await store.getDoc('contacts/nope')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('writes a new document with an exists:false precondition and a server timestamp', async () => {
    let commitBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === TOKEN_URL) return jsonResponse({ access_token: 'token', expires_in: 3600 });
        if (url.endsWith(':commit')) {
          commitBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return jsonResponse({});
        }
        return new Response('unexpected', { status: 500 });
      })
    );

    const store = new RestStore({
      projectId: 'sac-campus-hub',
      databaseId: 'prod',
      serviceAccount: serviceAccount('sa-add@example.iam.gserviceaccount.com'),
    });
    const id = await store.addDoc('mcp_audit_logs', {
      action: 'create',
      at: store.serverTimestamp(),
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const writes = (commitBody?.writes ?? []) as Record<string, unknown>[];
    const update = writes[0] as {
      update: { name: string };
      currentDocument?: { exists: boolean };
    };
    expect(update.update.name).toBe(
      `projects/sac-campus-hub/databases/prod/documents/mcp_audit_logs/${id}`
    );
    expect(update.currentDocument).toEqual({ exists: false });
    expect(writes[1]).toMatchObject({
      transform: {
        document: update.update.name,
        fieldTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }],
      },
    });
    vi.unstubAllGlobals();
  });

  it('queries a subcollection with an equal field filter', async () => {
    let queryBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === TOKEN_URL) return jsonResponse({ access_token: 'token', expires_in: 3600 });
        if (url.endsWith(':runQuery')) {
          queryBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return jsonResponse([
            {
              document: {
                name: 'projects/sac-campus-hub/databases/prod/documents/contacts/c1/interactions/i1',
                fields: { content: { stringValue: 'Coffee' } },
              },
            },
          ]);
        }
        return new Response('unexpected', { status: 500 });
      })
    );

    const store = new RestStore({
      projectId: 'sac-campus-hub',
      databaseId: 'prod',
      serviceAccount: serviceAccount('sa-query@example.iam.gserviceaccount.com'),
    });
    const rows = await store.getDocsWhere(
      'contacts/c1/interactions',
      'type',
      'chat',
      5
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].data.content).toBe('Coffee');
    expect(queryBody?.parent).toBe(
      'projects/sac-campus-hub/databases/prod/documents/contacts/c1'
    );
    expect(queryBody?.structuredQuery).toMatchObject({
      from: [{ collectionId: 'interactions' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'type' },
          op: 'EQUAL',
          value: { stringValue: 'chat' },
        },
      },
      limit: 5,
    });
    vi.unstubAllGlobals();
  });
});
