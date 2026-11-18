/**
 * In-memory Firestore backend.
 *
 * Used by the unit tests and by `MCP_BACKEND=memory` (offline stdio smoke
 * checks). It implements the same {@link FirestoreBackend} contract as the
 * Admin SDK and REST stores, including transactions and server timestamps,
 * so the tool layer can be exercised with no credentials and no network.
 */
import type {
  CollectionQuery,
  FirestoreBackend,
  FirestoreData,
  FirestoreDoc,
  TransactionContext,
} from './backend.ts';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function compareValues(left: unknown, right: unknown): number {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function splitPath(path: string): { collectionPath: string; id: string } {
  const parts = path.split('/').filter(Boolean);
  const id = parts.pop() ?? '';
  return { collectionPath: parts.join('/'), id };
}

export class MemoryBackend implements FirestoreBackend {
  readonly mode = 'memory' as const;
  readonly projectId = 'memory';
  readonly databaseId = 'memory';

  private readonly collections = new Map<string, Map<string, FirestoreData>>();
  private sequence = 0;

  private collection(collectionPath: string): Map<string, FirestoreData> {
    let found = this.collections.get(collectionPath);
    if (!found) {
      found = new Map();
      this.collections.set(collectionPath, found);
    }
    return found;
  }

  async getDoc(path: string): Promise<FirestoreDoc | null> {
    const { collectionPath, id } = splitPath(path);
    const data = this.collection(collectionPath).get(id);
    return data ? { id, data: clone(data) } : null;
  }

  async getDocsWhere(
    collectionPath: string,
    field: string,
    value: unknown,
    max = 10
  ): Promise<FirestoreDoc[]> {
    const docs = await this.listCollection(collectionPath);
    return docs.filter((doc) => doc.data[field] === value).slice(0, max);
  }

  async listCollection(
    collectionPath: string,
    options: CollectionQuery = {}
  ): Promise<FirestoreDoc[]> {
    let docs = [...this.collection(collectionPath).entries()].map(([id, data]) => ({
      id,
      data: clone(data),
    }));

    if (options.orderBy) {
      const field = options.orderBy;
      const factor = options.direction === 'desc' ? -1 : 1;
      docs = docs.sort(
        (left, right) => compareValues(left.data[field], right.data[field]) * factor
      );
    }
    if (options.limit) docs = docs.slice(0, options.limit);
    return docs;
  }

  async addDoc(collectionPath: string, data: FirestoreData): Promise<string> {
    const id = `mem_${++this.sequence}`;
    this.collection(collectionPath).set(id, clone(data));
    return id;
  }

  async runTransaction<T>(worker: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const pending = new Map<string, FirestoreData>();
    const tx: TransactionContext = {
      get: async (path) => {
        const { collectionPath, id } = splitPath(path);
        const data = pending.get(path) ?? this.collection(collectionPath).get(id);
        return data ? { id, data: clone(data) } : null;
      },
      update: (path, data) => {
        const { collectionPath, id } = splitPath(path);
        const current = pending.get(path) ?? this.collection(collectionPath).get(id) ?? {};
        pending.set(path, { ...current, ...clone(data) });
      },
      set: (path, data) => {
        pending.set(path, clone(data));
      },
    };

    const result = await worker(tx);

    for (const [path, data] of pending) {
      const { collectionPath, id } = splitPath(path);
      this.collection(collectionPath).set(id, data);
    }
    return result;
  }

  serverTimestamp(): unknown {
    return new Date();
  }
}
