import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagCombineEngine, TagEngineError } from '../server/tagEngine';

// Deterministic in-memory Firestore double for TagCombineEngine
function createFakeFirestore() {
  const store = new Map<string, Map<string, any>>();

  function getCollection(col: string) {
    if (!store.has(col)) store.set(col, new Map());
    return store.get(col)!;
  }

  const db: any = {
    _store: store,
    seed(colName: string, id: string, data: any) {
      getCollection(colName).set(id, { ...data });
    },
    getDoc(colName: string, id: string) {
      return getCollection(colName).get(id);
    },
    getDocs(colName: string) {
      return Array.from(getCollection(colName).values());
    },
    collection(colName: string) {
      return {
        doc(id?: string) {
          const docId = id || `doc_${Math.random().toString(36).slice(2, 9)}`;
          return {
            id: docId,
            ref: { id: docId },
            get: vi.fn(async () => {
              const data = getCollection(colName).get(docId);
              return {
                id: docId,
                exists: data !== undefined,
                data: () => (data ? { ...data } : undefined),
                ref: db.collection(colName).doc(docId),
              };
            }),
            set: vi.fn(async (data: any, options?: { merge?: boolean }) => {
              const current = getCollection(colName).get(docId) || {};
              const next = options?.merge ? { ...current, ...data } : { ...data };
              getCollection(colName).set(docId, next);
            }),
            update: vi.fn(async (updates: any) => {
              const current = getCollection(colName).get(docId);
              if (!current) throw new Error(`Document ${docId} not found`);
              for (const [key, val] of Object.entries(updates)) {
                current[key] = val;
              }
              getCollection(colName).set(docId, current);
            }),
          };
        },
        get: vi.fn(async () => {
          const docs = Array.from(getCollection(colName).entries()).map(([id, doc]) => ({
            id,
            exists: true,
            data: () => ({ ...doc }),
            ref: db.collection(colName).doc(id),
          }));
          return {
            empty: docs.length === 0,
            size: docs.length,
            docs,
            forEach: (cb: any) => docs.forEach(cb),
          };
        }),
        add: vi.fn(async (data: any) => {
          const id = `doc_${Math.random().toString(36).slice(2, 9)}`;
          getCollection(colName).set(id, { ...data });
          return db.collection(colName).doc(id);
        }),
      };
    },
    batch() {
      const operations: Array<() => Promise<void>> = [];
      return {
        update(ref: any, data: any) {
          operations.push(async () => {
            await ref.update(data);
          });
          return this;
        },
        set(ref: any, data: any, options?: any) {
          operations.push(async () => {
            await ref.set(data, options);
          });
          return this;
        },
        async commit() {
          for (const op of operations) {
            await op();
          }
        },
      };
    },
    async runTransaction(updateFunction: (tx: any) => Promise<any>) {
      const tx = {
        async get(ref: any) {
          return ref.get();
        },
        update(ref: any, data: any) {
          return ref.update(data);
        },
        set(ref: any, data: any, options?: any) {
          return ref.set(data, options);
        },
      };
      return updateFunction(tx);
    },
  };

  return db;
}

describe('TagCombineEngine — Server-Side Tag Operations', () => {
  let db: ReturnType<typeof createFakeFirestore>;
  let engine: TagCombineEngine;

  beforeEach(() => {
    db = createFakeFirestore();
    engine = new TagCombineEngine({ db });
  });

  describe('combineTags', () => {
    const seedContacts = () => {
      db.seed('contacts', 'c1', { name: 'Alice', tags: ['BFA table', 'BFA'] });
      db.seed('contacts', 'c2', { name: 'Bob', tags: ['bfa-table'] });
      db.seed('contacts', 'c3', { name: 'Charlie', tags: ['Saved'] });
    };

    it('rewrites tags across affected contacts, drops duplicates, and creates done snapshot', async () => {
      seedContacts();

      const result = await engine.combineTags({
        combines: [{ variants: ['BFA table', 'bfa-table'], target: 'BFA' }],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(result.success).toBe(true);
      expect(result.changedCount).toBe(2);
      expect(result.combineRecordId).toBeTruthy();

      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA']);
      expect(db.getDoc('contacts', 'c2')?.tags).toEqual(['BFA']);
      expect(db.getDoc('contacts', 'c3')?.tags).toEqual(['Saved']);

      const record = db.getDoc('combineRecords', result.combineRecordId!);
      expect(record).toBeDefined();
      expect(record.kind).toBe('tags');
      expect(record.status).toBe('done');
      expect(record.combinedBy).toBe('user-admin');
      expect(record.combinedByName).toBe('Admin Staff');
      expect(record.contacts).toEqual([
        { contactId: 'c1', name: 'Alice', before: ['BFA table', 'BFA'], after: ['BFA'] },
        { contactId: 'c2', name: 'Bob', before: ['bfa-table'], after: ['BFA'] },
      ]);

      const activities = db.getDocs('activities');
      expect(activities.filter((a: any) => a.action === 'combined tags on')).toHaveLength(2);
    });

    it('previews combined tags without applying mutations on dry run', async () => {
      seedContacts();

      const result = await engine.combineTags({
        combines: [{ variants: ['BFA table', 'bfa-table'], target: 'BFA' }],
        dryRun: true,
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.rows).toEqual([
        { contactId: 'c1', name: 'Alice', from: ['BFA table', 'BFA'], to: ['BFA'] },
        { contactId: 'c2', name: 'Bob', from: ['bfa-table'], to: ['BFA'] },
      ]);

      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA table', 'BFA']);
      expect(db.getDocs('combineRecords')).toHaveLength(0);
      expect(db.getDocs('activities')).toHaveLength(0);
    });

    it('adds requested targets to settings/standard_tags and persists in record', async () => {
      seedContacts();
      db.seed('settings', 'standard_tags', { tags: ['Saved', 'Baptized'] });

      const result = await engine.combineTags({
        combines: [{ variants: ['BFA table', 'bfa-table'], target: 'Outreach' }],
        makeStandard: ['Outreach', 'Saved'],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(result.success).toBe(true);
      const standardDoc = db.getDoc('settings', 'standard_tags');
      expect(standardDoc.tags).toEqual(['Saved', 'Baptized', 'Outreach']);

      const record = db.getDoc('combineRecords', result.combineRecordId!);
      expect(record.standardTagsAdded).toEqual(['Outreach']);
    });

    it('throws TagEngineError (400) for missing or invalid combines', async () => {
      await expect(
        engine.combineTags({
          combines: [],
          actorId: 'user-admin',
          actorName: 'Admin Staff',
        }),
      ).rejects.toThrow(TagEngineError);
    });

    it('supports multi-collection tag replacement across contacts and groups', async () => {
      seedContacts();
      db.seed('groups', 'g1', { name: 'Wednesday Group', tags: ['bfa-table'] });
      db.seed('groups', 'g2', { name: 'Friday Group', tags: ['Other'] });

      const result = await engine.combineTags({
        combines: [{ variants: ['BFA table', 'bfa-table'], target: 'BFA' }],
        collections: ['contacts', 'groups'],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(result.success).toBe(true);
      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA']);
      expect(db.getDoc('contacts', 'c2')?.tags).toEqual(['BFA']);
      expect(db.getDoc('groups', 'g1')?.tags).toEqual(['BFA']);
      expect(db.getDoc('groups', 'g2')?.tags).toEqual(['Other']);
      expect(result.multiCollectionChangedCount).toBe(1);

      const record = db.getDoc('combineRecords', result.combineRecordId!);
      expect(record.documents).toBeDefined();
      expect(record.documents).toEqual([
        {
          collection: 'groups',
          documentId: 'g1',
          name: 'Wednesday Group',
          before: ['bfa-table'],
          after: ['BFA'],
        },
      ]);
    });
  });

  describe('undoCombine', () => {
    it('accurately restores tags across all affected documents on rollback', async () => {
      db.seed('contacts', 'c1', { name: 'Alice', tags: ['BFA table', 'BFA'] });
      db.seed('contacts', 'c2', { name: 'Bob', tags: ['bfa-table'] });

      const combineResult = await engine.combineTags({
        combines: [{ variants: ['BFA table', 'bfa-table'], target: 'BFA' }],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA']);
      expect(db.getDoc('contacts', 'c2')?.tags).toEqual(['BFA']);

      const undoResult = await engine.undoCombine({
        combineRecordId: combineResult.combineRecordId!,
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(undoResult.success).toBe(true);
      expect(undoResult.restoredCount).toBe(2);
      expect(undoResult.skippedCount).toBe(0);

      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA table', 'BFA']);
      expect(db.getDoc('contacts', 'c2')?.tags).toEqual(['bfa-table']);

      const record = db.getDoc('combineRecords', combineResult.combineRecordId!);
      expect(record.status).toBe('undone');
      expect(record.undoneBy).toBe('user-admin');
      expect(record.undoneByName).toBe('Admin Staff');

      const activities = db.getDocs('activities');
      expect(activities.filter((a: any) => a.action === 'undid tag combine')).toHaveLength(2);
    });

    it('previews undo results without writing when dryRun is set', async () => {
      db.seed('contacts', 'c1', { name: 'Alice', tags: ['BFA table', 'BFA'] });
      const combineResult = await engine.combineTags({
        combines: [{ variants: ['BFA table'], target: 'BFA' }],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      const previewResult = await engine.undoCombine({
        combineRecordId: combineResult.combineRecordId!,
        dryRun: true,
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(previewResult.success).toBe(true);
      expect(previewResult.dryRun).toBe(true);
      expect(previewResult.preview.restored).toEqual([
        {
          contactId: 'c1',
          name: 'Alice',
          current: ['BFA'],
          before: ['BFA table', 'BFA'],
        },
      ]);

      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA']);
      expect(db.getDoc('combineRecords', combineResult.combineRecordId!)?.status).toBe('done');
    });

    it('skips and reports contacts that were re-tagged after the combine', async () => {
      db.seed('contacts', 'c1', { name: 'Alice', tags: ['BFA table'] });
      db.seed('contacts', 'c2', { name: 'Bob', tags: ['bfa-table'] });

      const combineResult = await engine.combineTags({
        combines: [{ variants: ['BFA table', 'bfa-table'], target: 'BFA' }],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      // Bob receives a new tag after combine
      db.seed('contacts', 'c2', { name: 'Bob', tags: ['BFA', 'Fall 2026'] });

      const undoResult = await engine.undoCombine({
        combineRecordId: combineResult.combineRecordId!,
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(undoResult.restoredCount).toBe(1);
      expect(undoResult.skippedCount).toBe(1);
      expect(undoResult.preview.skipped).toEqual([
        {
          contactId: 'c2',
          name: 'Bob',
          current: ['BFA', 'Fall 2026'],
          after: ['BFA'],
        },
      ]);

      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA table']);
      expect(db.getDoc('contacts', 'c2')?.tags).toEqual(['BFA', 'Fall 2026']);
    });

    it('refuses to undo an already undone combine (409)', async () => {
      db.seed('contacts', 'c1', { name: 'Alice', tags: ['BFA table'] });
      const combineResult = await engine.combineTags({
        combines: [{ variants: ['BFA table'], target: 'BFA' }],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      await engine.undoCombine({
        combineRecordId: combineResult.combineRecordId!,
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      await expect(
        engine.undoCombine({
          combineRecordId: combineResult.combineRecordId!,
          actorId: 'user-admin',
          actorName: 'Admin Staff',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('refuses an unclaimable pending/undoing record with 409', async () => {
      db.seed('combineRecords', 'rec-1', {
        kind: 'tags',
        status: 'undoing',
        claimedAt: new Date().toISOString(),
        contacts: [],
      });

      await expect(
        engine.undoCombine({
          combineRecordId: 'rec-1',
          actorId: 'user-admin',
          actorName: 'Admin Staff',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('throws 404 for a missing combine record', async () => {
      await expect(
        engine.undoCombine({
          combineRecordId: 'non-existent',
          actorId: 'user-admin',
          actorName: 'Admin Staff',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when record is not a tags combine', async () => {
      db.seed('combineRecords', 'rec-contact', {
        kind: 'contacts',
        status: 'done',
      });

      await expect(
        engine.undoCombine({
          combineRecordId: 'rec-contact',
          actorId: 'user-admin',
          actorName: 'Admin Staff',
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('restores tags across multiple collections on undo', async () => {
      db.seed('contacts', 'c1', { name: 'Alice', tags: ['BFA table'] });
      db.seed('groups', 'g1', { name: 'Wed Group', tags: ['BFA table'] });

      const combineResult = await engine.combineTags({
        combines: [{ variants: ['BFA table'], target: 'BFA' }],
        collections: ['contacts', 'groups'],
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA']);
      expect(db.getDoc('groups', 'g1')?.tags).toEqual(['BFA']);

      const undoResult = await engine.undoCombine({
        combineRecordId: combineResult.combineRecordId!,
        actorId: 'user-admin',
        actorName: 'Admin Staff',
      });

      expect(undoResult.success).toBe(true);
      expect(db.getDoc('contacts', 'c1')?.tags).toEqual(['BFA table']);
      expect(db.getDoc('groups', 'g1')?.tags).toEqual(['BFA table']);
    });
  });
});
