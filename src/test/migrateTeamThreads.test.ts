import { describe, it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { migrateTeamThreads, teamThreadPath } from '../../scripts/migrate-team-threads';

function fakeFirestore(docs: { path: string; data: Record<string, unknown> }[]) {
  const ops: [string, string, unknown?][] = [];
  // No `where`: a collection-group equality filter needs an index that does
  // not exist, so the script reads the group and filters in memory.
  const firestore = {
    collectionGroup: vi.fn(() => ({
      get: async () => ({ docs: docs.map((d) => ({ ref: { path: d.path }, data: () => d.data })) }),
    })),
    doc: (path: string) => ({ path }),
    batch: () => {
      const pending: [string, string, unknown?][] = [];
      return {
        set: (ref: { path: string }, data: unknown) => pending.push(['set', ref.path, data]),
        delete: (ref: { path: string }) => pending.push(['delete', ref.path]),
        commit: async () => void ops.push(...pending),
      };
    },
  };
  return { firestore: firestore as unknown as Firestore, ops };
}

describe('migrate-team-threads', () => {
  it('maps a contact thread path to its teamThreads twin, and nothing else', () => {
    expect(teamThreadPath('contacts/c1/threads/m1')).toBe('contacts/c1/teamThreads/m1');
    expect(teamThreadPath('rooms/r1/threads/m1')).toBeNull();
  });

  it('picks out only team-scope docs, and writes nothing on a dry run', async () => {
    const { firestore, ops } = fakeFirestore([
      { path: 'contacts/c1/threads/t1', data: { scope: 'team', body: 'x' } },
      { path: 'contacts/c1/threads/o1', data: { scope: null, body: 'open' } },
      { path: 'contacts/c1/threads/o2', data: { body: 'mobile, no scope field' } },
    ]);
    const report = await migrateTeamThreads(firestore, { write: false, log: () => {} });
    expect(report).toEqual({ moved: 1, skipped: 0 });
    expect(ops).toEqual([]);
  });

  it('copies each doc to teamThreads under the same id and deletes the original in one batch', async () => {
    const data = { scope: 'team', body: 'x', from: 'ft' };
    const { firestore, ops } = fakeFirestore([
      { path: 'contacts/c1/threads/t1', data },
      { path: 'rooms/r1/threads/t2', data },
    ]);
    const report = await migrateTeamThreads(firestore, { write: true, log: () => {} });
    expect(report).toEqual({ moved: 1, skipped: 1 });
    expect(ops).toEqual([
      ['set', 'contacts/c1/teamThreads/t1', data],
      ['delete', 'contacts/c1/threads/t1'],
    ]);
  });
});
