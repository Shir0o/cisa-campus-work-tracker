import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ __mockServerTimestamp: true }),
    delete: () => ({ __mockDelete: true }),
  },
}));

import {
  ContactCombineEngine,
  isContactCombineRecord,
  COMBINE_CLAIM_TTL_MS,
} from '../server/contactEngine';

// Deterministic in-memory Firestore double for ContactCombineEngine
function createFakeFirestore() {
  type Doc = Record<string, any>;
  const store: Record<string, Record<string, Doc>> = {};
  let seq = 0;

  const applyUpdate = (current: Doc | undefined, u: Doc): Doc => {
    const target: Doc = { ...(current ?? {}) };
    for (const [key, v] of Object.entries(u)) {
      const path = key.split('.');
      let node = target;
      for (const segment of path.slice(0, -1)) {
        node = node[segment] = { ...(node[segment] ?? {}) };
      }
      const leaf = path[path.length - 1];
      if (v && (v as any).__mockDelete) {
        delete node[leaf];
      } else {
        node[leaf] = v;
      }
    }
    return target;
  };

  const snapshot = (docs: Array<{ id: string; data: () => Doc; ref: any }>) => ({
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (cb: (d: any) => void) => docs.forEach(cb),
  });

  const collection = (name: string) => {
    const col = (store[name] ??= {});

    const docHandle = (docId: string) => {
      const handle: any = {
        id: docId,
        _col: name,
        _id: docId,
        get: async () => {
          const data = col[docId];
          return {
            exists: docId in col,
            data: () => (data ? { ...data } : undefined),
            id: docId,
            ref: handle,
          };
        },
        set: async (d: Doc) => {
          col[docId] = { ...d };
        },
        delete: async () => {
          delete col[docId];
        },
        update: async (u: Doc) => {
          if (!(docId in col)) throw new Error(`Document ${docId} not found in ${name}`);
          col[docId] = applyUpdate(col[docId], u);
        },
        collection: (sub: string) => collection(`${name}/${docId}/${sub}`),
      };
      handle.ref = handle;
      return handle;
    };

    const list = () =>
      Object.entries(col).map(([id, data]) => ({
        id,
        ref: docHandle(id),
        data: () => ({ ...data }),
      }));

    const filtered = (pred: (d: any) => boolean) => ({
      get: async () => snapshot(list().filter(pred)),
      limit: (n: number) => ({ get: async () => snapshot(list().filter(pred).slice(0, n)) }),
    });

    return {
      add: async (data: Doc) => {
        const id = `doc-${++seq}`;
        col[id] = { ...data };
        return docHandle(id);
      },
      doc: (id?: string) => docHandle(id || `doc-${++seq}`),
      where: (field: string, op: string, value: any) =>
        filtered((d) => {
          const v = d.data()[field];
          if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
          if (op === 'in') return Array.isArray(value) && value.includes(v);
          return v === value;
        }),
      get: async () => snapshot(list()),
    };
  };

  let txQueue: Promise<unknown> = Promise.resolve();

  const db: any = {
    _store: store,
    seed(colName: string, id: string, data: any) {
      const col = (store[colName] ??= {});
      col[id] = { ...data };
    },
    getDoc(colName: string, id: string) {
      return store[colName]?.[id];
    },
    getCollection(colName: string) {
      return store[colName] ?? {};
    },
    collection,
    runTransaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const run = async () => {
        const writes: Array<{
          ref: any;
          data: Doc;
          kind: 'set' | 'merge' | 'update' | 'delete';
        }> = [];
        const tx = {
          get: async (refOrQuery: any) => {
            if (typeof refOrQuery.get === 'function') {
              return refOrQuery.get();
            }
            return refOrQuery.get();
          },
          set: (ref: any, data: Doc, opts?: { merge?: boolean }) => {
            writes.push({ ref, data, kind: opts?.merge ? 'merge' : 'set' });
          },
          update: (ref: any, data: Doc) => {
            writes.push({ ref, data, kind: 'update' });
          },
          delete: (ref: any) => {
            writes.push({ ref, data: {}, kind: 'delete' });
          },
        };
        const result = await fn(tx);
        for (const w of writes) {
          const col = (store[w.ref._col] ??= {});
          if (w.kind === 'delete') delete col[w.ref._id];
          else if (w.kind === 'update') col[w.ref._id] = applyUpdate(col[w.ref._id], w.data);
          else col[w.ref._id] = w.kind === 'merge' ? { ...(col[w.ref._id] ?? {}), ...w.data } : { ...w.data };
        }
        return result;
      };
      const next = txQueue.then(run, run);
      txQueue = next.catch(() => {});
      return next;
    },
    batch: () => {
      const pending: Array<() => Promise<void>> = [];
      return {
        set: (ref: any, data: Doc) => {
          pending.push(async () => {
            await ref.set(data);
          });
        },
        update: (ref: any, data: Doc) => {
          pending.push(async () => {
            await ref.update(data);
          });
        },
        delete: (ref: any) => {
          pending.push(async () => {
            await ref.delete();
          });
        },
        commit: async () => {
          for (const op of pending) await op();
        },
      };
    },
  };

  return db;
}

describe('ContactCombineEngine — Server Transaction Engine (#1586)', () => {
  let db: ReturnType<typeof createFakeFirestore>;
  let engine: ContactCombineEngine;

  const seedStandardPair = () => {
    db.seed('contacts', 'target-1', {
      name: 'Canonical Person',
      email: 'person@example.com',
      phone: '1234567890',
      stage: 'Lead',
      tags: ['Alpha'],
      updatedAt: '2026-10-01T10:00:00.000Z',
    });
    db.seed('contacts', 'source-2', {
      name: 'Duplicate Person',
      email: 'person@example.com',
      phone: '1234567890',
      stage: 'Contact',
      tags: ['Beta'],
      updatedAt: '2026-10-01T10:00:00.000Z',
    });
    // Subcollections
    db.seed('contacts/source-2/interactions', 'int-1', {
      content: 'Met at coffee shop',
      authorId: 'user-1',
    });
    db.seed('contacts/source-2/threads', 'thr-1', { body: 'Follow-up thread' });
    db.seed('contacts/source-2/teamThreads', 'tth-1', { body: 'Team sync notes' });
    db.seed('contacts/source-2/comments', 'com-1', { text: 'Helpful note' });

    // References across collections
    db.seed('prayers', 'pry-1', { contactId: 'source-2', text: 'Pray for exams' });
    db.seed('tasks', 'tsk-1', { contactId: 'source-2', text: 'Call back' });
    db.seed('visits', 'vst-1', {
      contactIds: ['source-2', 'target-1'],
      contactNames: ['Duplicate Person', 'Canonical Person'],
    });
    db.seed('events', 'evt-1', {
      name: 'Welcome Dinner',
      roster: ['source-2'],
      rosterOverride: ['source-2'],
      rosterOverrideBase: ['source-2'],
      attendance: { present: ['source-2'], absent: [] },
    });
    db.seed('rhythms', 'rhy-1', { name: 'Campus Group', roster: ['source-2'] });
    db.seed('homes', 'hom-1', { label: 'North House', members: ['source-2'] });
    db.seed('outreach', 'out-1', {
      names: [{ id: 'o-1', name: 'Duplicate Person', contactId: 'source-2' }],
    });
    db.seed('attendee_aliases', 'ali-1', { contactId: 'source-2', alias: 'Dupe' });
    db.seed('pending_attendance_imports', 'imp-1', {
      preview: [{ contactId: 'source-2', name: 'Duplicate Person' }],
    });
    db.seed('users', 'usr-1', { name: 'Staff User' });
    db.seed('users/usr-1/personalPrayers', 'ppr-1', { contactId: 'source-2' });
    db.seed('userPreferences', 'pref-1', { pinnedContactIds: ['source-2'] });
    db.seed('inboxState', 'inb-1', {
      assigned: { 'source-2': true },
      read: { 'source-2': true },
    });
    db.seed('notifications', 'not-1', {
      targetId: 'source-2',
      link: '/contacts/source-2',
    });
    db.seed('activities', 'act-1', {
      targetId: 'source-2',
      targetType: 'contact',
      targetName: 'Duplicate Person',
    });
  };

  beforeEach(() => {
    db = createFakeFirestore();
    engine = new ContactCombineEngine({ db });
  });

  describe('previewCombine', () => {
    it('calculates moves and diffs without modifying the database (dry-run)', async () => {
      seedStandardPair();

      const result = await engine.previewCombine('source-2', 'target-1', {
        expectedTimestamps: {
          sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
          targetUpdatedAt: '2026-10-01T10:00:00.000Z',
        },
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.moves).toBeDefined();
      expect(result.moves.length).toBeGreaterThan(0);

      // Verify DB state was NOT mutated
      expect(db.getDoc('contacts', 'source-2')).toBeDefined();
      expect(db.getDoc('contacts', 'target-1')?.tags).toEqual(['Alpha']);
      expect(db.getDoc('prayers', 'pry-1')?.contactId).toBe('source-2');
    });

    it('rejects stale preview with 409 conflict when contact timestamp changed', async () => {
      seedStandardPair();

      await expect(
        engine.previewCombine('source-2', 'target-1', {
          expectedTimestamps: {
            sourceUpdatedAt: '2026-10-01T09:00:00.000Z', // Mismatched!
            targetUpdatedAt: '2026-10-01T10:00:00.000Z',
          },
        }),
      ).rejects.toMatchObject({
        status: 409,
        extra: { conflict: true },
      });
    });

    it('rejects with 409 when either contact is part of an in-flight combine', async () => {
      seedStandardPair();
      db.seed('combineRecords', 'busy-record', {
        kind: 'contacts',
        status: 'pending',
        keptId: 'target-1',
        combinedInId: 'other-99',
        claimedAt: new Date().toISOString(),
      });

      await expect(
        engine.previewCombine('source-2', 'target-1'),
      ).rejects.toMatchObject({
        status: 409,
        extra: { inFlightCombineId: 'busy-record' },
      });
    });

    it('rejects with 404 when target or source contact does not exist', async () => {
      seedStandardPair();

      await expect(
        engine.previewCombine('non-existent', 'target-1'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects with 400 when IDs are missing or identical', async () => {
      await expect(
        engine.previewCombine('', 'target-1'),
      ).rejects.toMatchObject({ status: 400 });

      await expect(
        engine.previewCombine('same-id', 'same-id'),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('executeCombine', () => {
    it('executes combine across all collections and writes a done record with snapshot', async () => {
      seedStandardPair();

      const result = await engine.executeCombine('source-2', 'target-1', {
        sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
        targetUpdatedAt: '2026-10-01T10:00:00.000Z',
      }, {
        actorId: 'admin-1',
        actorName: 'Lead Admin',
      });

      expect(result.success).toBe(true);
      expect(result.combineRecordId).toBeDefined();

      // 1. Target contact updated with unioned tags and combinedFrom banner
      const targetDoc = db.getDoc('contacts', 'target-1');
      expect(targetDoc).toBeDefined();
      expect(targetDoc.tags).toEqual(['Alpha', 'Beta']);
      expect(targetDoc.combinedFrom).toMatchObject({
        name: 'Duplicate Person',
        byName: 'Lead Admin',
        combineRecordId: result.combineRecordId,
      });

      // 2. Source contact deleted
      expect(db.getDoc('contacts', 'source-2')).toBeUndefined();

      // 3. Subcollections moved from source to target
      expect(db.getDoc('contacts/target-1/interactions', 'int-1')).toBeDefined();
      expect(db.getDoc('contacts/source-2/interactions', 'int-1')).toBeUndefined();
      expect(db.getDoc('contacts/target-1/threads', 'thr-1')).toBeDefined();
      expect(db.getDoc('contacts/target-1/teamThreads', 'tth-1')).toBeDefined();
      expect(db.getDoc('contacts/target-1/comments', 'com-1')).toBeDefined();

      // 4. External references rewritten
      expect(db.getDoc('prayers', 'pry-1')?.contactId).toBe('target-1');
      expect(db.getDoc('tasks', 'tsk-1')?.contactId).toBe('target-1');
      expect(db.getDoc('events', 'evt-1')?.roster).toEqual(['target-1']);
      expect(db.getDoc('rhythms', 'rhy-1')?.roster).toEqual(['target-1']);
      expect(db.getDoc('homes', 'hom-1')?.members).toEqual(['target-1']);
      expect(db.getDoc('attendee_aliases', 'ali-1')?.contactId).toBe('target-1');
      expect(db.getDoc('notifications', 'not-1')?.targetId).toBe('target-1');

      // 5. Combine record written with kind contacts and status done
      const record = db.getDoc('combineRecords', result.combineRecordId);
      expect(record).toBeDefined();
      expect(record.kind).toBe('contacts');
      expect(record.status).toBe('done');
      expect(record.keptId).toBe('target-1');
      expect(record.combinedInId).toBe('source-2');
      expect(record.keptBefore).toBeDefined();
      expect(record.combinedInBefore).toBeDefined();
      expect(isContactCombineRecord(record)).toBe(true);

      // 6. Activity log written
      const activities = Object.values(db.getCollection('activities'));
      const combineActivity = activities.find(
        (a: any) => a.action === 'combined contact into',
      );
      expect(combineActivity).toBeDefined();
      expect((combineActivity as any).userId).toBe('admin-1');
    });

    it('rejects with 400 when expected timestamps are missing', async () => {
      seedStandardPair();

      await expect(
        engine.executeCombine('source-2', 'target-1', undefined as any, {
          actorId: 'admin-1',
          actorName: 'Admin',
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects with 409 conflict when target timestamp changes right before execution', async () => {
      seedStandardPair();

      await expect(
        engine.executeCombine('source-2', 'target-1', {
          sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
          targetUpdatedAt: '2026-10-01T09:00:00.000Z', // Stale
        }, {
          actorId: 'admin-1',
          actorName: 'Admin',
        }),
      ).rejects.toMatchObject({ status: 409, extra: { conflict: true } });
    });

    it('chunks operations exceeding 500 writes into batched commits and marks done', async () => {
      seedStandardPair();

      // Seed 520 tasks referencing source-2
      for (let i = 0; i < 520; i++) {
        db.seed('tasks', `tsk-batch-${i}`, { contactId: 'source-2', text: `Task ${i}` });
      }

      const result = await engine.executeCombine('source-2', 'target-1', {
        sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
        targetUpdatedAt: '2026-10-01T10:00:00.000Z',
      }, {
        actorId: 'admin-1',
        actorName: 'Admin',
      });

      expect(result.success).toBe(true);
      const record = db.getDoc('combineRecords', result.combineRecordId);
      expect(record.status).toBe('done');

      // Verify all 520 tasks were rewritten
      const tasks = Object.values(db.getCollection('tasks'));
      const batchTasks = tasks.filter((t: any) => t.contactId === 'target-1');
      expect(batchTasks.length).toBeGreaterThanOrEqual(520);
    });
  });

  describe('previewUndo', () => {
    it('previews rollback items without mutating the database', async () => {
      seedStandardPair();

      const combineResult = await engine.executeCombine('source-2', 'target-1', {
        sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
        targetUpdatedAt: '2026-10-01T10:00:00.000Z',
      }, { actorId: 'admin-1', actorName: 'Admin' });

      const undoPreview = await engine.previewUndo(combineResult.combineRecordId);
      expect(undoPreview.success).toBe(true);
      expect(undoPreview.dryRun).toBe(true);
      expect(undoPreview.preview.goesBack.length).toBeGreaterThan(0);

      // Verify DB was NOT mutated by the preview
      expect(db.getDoc('contacts', 'source-2')).toBeUndefined();
    });

    it('refuses to undo when target was later combined into another contact (409)', async () => {
      seedStandardPair();

      const firstResult = await engine.executeCombine('source-2', 'target-1', {
        sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
        targetUpdatedAt: '2026-10-01T10:00:00.000Z',
      }, { actorId: 'admin-1', actorName: 'Admin' });

      // Simulate a later combine where target-1 was absorbed into super-target-99
      db.seed('contacts', 'super-target-99', {
        name: 'Super Target',
        updatedAt: '2026-10-02T10:00:00.000Z',
      });
      db.seed('combineRecords', 'later-combine-record', {
        kind: 'contacts',
        status: 'done',
        keptId: 'super-target-99',
        combinedInId: 'target-1',
        keptBefore: { name: 'Super Target' },
      });

      await expect(
        engine.previewUndo(firstResult.combineRecordId),
      ).rejects.toMatchObject({
        status: 409,
        extra: { laterCombineId: 'later-combine-record' },
      });
    });

    it('refuses when record is not a contact combine record (400)', async () => {
      db.seed('combineRecords', 'tag-record', {
        kind: 'tags',
        status: 'done',
      });

      await expect(
        engine.previewUndo('tag-record'),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Not a contact combine record',
      });
    });
  });

  describe('executeUndo', () => {
    it('completely restores both contacts and all pointer references to their pre-combine state', async () => {
      seedStandardPair();

      const combineResult = await engine.executeCombine('source-2', 'target-1', {
        sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
        targetUpdatedAt: '2026-10-01T10:00:00.000Z',
      }, { actorId: 'admin-1', actorName: 'Admin' });

      const undoResult = await engine.executeUndo(combineResult.combineRecordId, {
        actorId: 'admin-1',
        actorName: 'Admin',
      });

      expect(undoResult.success).toBe(true);

      // 1. Source contact recreated with original attributes
      const recreatedSource = db.getDoc('contacts', 'source-2');
      expect(recreatedSource).toBeDefined();
      expect(recreatedSource.name).toBe('Duplicate Person');
      expect(recreatedSource.tags).toEqual(['Beta']);

      // 2. Target contact restored to pre-combine state (combinedFrom banner removed)
      const targetDoc = db.getDoc('contacts', 'target-1');
      expect(targetDoc.tags).toEqual(['Alpha']);
      expect(targetDoc.combinedFrom).toBeUndefined();

      // 3. Subcollections moved back
      expect(db.getDoc('contacts/source-2/interactions', 'int-1')).toBeDefined();
      expect(db.getDoc('contacts/target-1/interactions', 'int-1')).toBeUndefined();

      // 4. Pointer references returned
      expect(db.getDoc('prayers', 'pry-1')?.contactId).toBe('source-2');
      expect(db.getDoc('tasks', 'tsk-1')?.contactId).toBe('source-2');
      expect(db.getDoc('events', 'evt-1')?.roster).toEqual(['source-2']);

      // 5. Combine record marked undone
      const record = db.getDoc('combineRecords', combineResult.combineRecordId);
      expect(record.status).toBe('undone');
      expect(record.undoneBy).toBe('admin-1');

      // 6. Refuses second undo with 409
      await expect(
        engine.executeUndo(combineResult.combineRecordId, {
          actorId: 'admin-1',
          actorName: 'Admin',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('retries an interrupted undo whose claim TTL has expired', async () => {
      seedStandardPair();

      const combineResult = await engine.executeCombine('source-2', 'target-1', {
        sourceUpdatedAt: '2026-10-01T10:00:00.000Z',
        targetUpdatedAt: '2026-10-01T10:00:00.000Z',
      }, { actorId: 'admin-1', actorName: 'Admin' });

      // Mark as interrupted undo with an expired claim (> 10 minutes ago)
      const expiredTime = new Date(Date.now() - (COMBINE_CLAIM_TTL_MS + 60000)).toISOString();
      db.seed('combineRecords', combineResult.combineRecordId, {
        ...db.getDoc('combineRecords', combineResult.combineRecordId),
        status: 'undoing',
        claimedAt: expiredTime,
      });

      // Should succeed in claiming and replaying
      const result = await engine.executeUndo(combineResult.combineRecordId, {
        actorId: 'admin-1',
        actorName: 'Admin',
      });
      expect(result.success).toBe(true);
      expect(db.getDoc('combineRecords', combineResult.combineRecordId)?.status).toBe('undone');
    });
  });

  describe('schema decoupling & helpers', () => {
    it('isContactCombineRecord identifies contact records and distinguishes from tag records', () => {
      expect(isContactCombineRecord({ kind: 'contacts' })).toBe(true);
      expect(isContactCombineRecord({ kind: undefined })).toBe(true); // legacy contact records
      expect(isContactCombineRecord({ kind: 'tags' })).toBe(false);
      expect(isContactCombineRecord(null)).toBe(false);
      expect(isContactCombineRecord('not-object')).toBe(false);
    });
  });
});
