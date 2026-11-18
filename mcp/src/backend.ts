/**
 * The Firestore surface the MCP tools depend on.
 *
 * Types only, so the Cloudflare Worker (`mcp/worker`) can import the tool
 * definitions without pulling in `firebase-admin` or Node built-ins. The
 * implementations are:
 *
 * - `src/firestore.ts` — Admin SDK, for stdio and Streamable HTTP (Node).
 * - `src/rest-store.ts` — Firestore REST + WebCrypto JWT, for Workers.
 * - `src/memory.ts` — in-memory, for tests and offline protocol checks.
 */

export type FirestoreData = Record<string, unknown>;

export interface FirestoreDoc {
  id: string;
  data: FirestoreData;
}

export interface CollectionQuery {
  orderBy?: string;
  direction?: 'asc' | 'desc';
  limit?: number;
}

export interface TransactionContext {
  get(path: string): Promise<FirestoreDoc | null>;
  update(path: string, data: FirestoreData): void;
  set(path: string, data: FirestoreData): void;
}

export interface FirestoreBackend {
  readonly mode: 'service-account' | 'client' | 'memory';
  readonly projectId: string;
  readonly databaseId: string;
  getDoc(path: string): Promise<FirestoreDoc | null>;
  getDocsWhere(collectionPath: string, field: string, value: unknown, max?: number): Promise<FirestoreDoc[]>;
  listCollection(collectionPath: string, options?: CollectionQuery): Promise<FirestoreDoc[]>;
  addDoc(collectionPath: string, data: FirestoreData): Promise<string>;
  runTransaction<T>(worker: (tx: TransactionContext) => Promise<T>): Promise<T>;
  serverTimestamp(): unknown;
}
