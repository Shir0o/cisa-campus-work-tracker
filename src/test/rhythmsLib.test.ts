import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRhythm,
  updateRhythm,
  deleteRhythm,
  extendRhythmTerm,
  repairRhythmOccurrences,
  cancelGatheringForRhythm,
  uncancelGatheringDoc,
  fetchRhythmGatherings,
  subscribeRhythms,
  generateOccurrenceDates,
} from '../lib/rhythms';
import { updateDoc, deleteDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError } from '../lib/firebase';
import type { Gathering, Rhythm } from '../types';

const batchSet = vi.fn();
const batchUpdate = vi.fn();
const batchDelete = vi.fn();
const batchCommit = vi.fn(() => Promise.resolve());

vi.mock('firebase/firestore', () => {
  let counter = 0;
  return {
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    doc: vi.fn((_db: any, ...segments: any[]) => {
      const firstIsCollection = _db && typeof _db === 'object' && 'path' in _db;
      const parts = firstIsCollection
        ? [_db.path, ...segments.map((s: any) => (typeof s === 'string' ? s : s.path))]
        : segments.map((s: any) => (typeof s === 'string' ? s : s.path));
      const ref: any = { path: parts.length <= 1 ? parts[0] : parts.join('/') };
      const id = parts.length <= 1 ? parts[0] + '-gen-' + (++counter) : parts[parts.length - 1];
      Object.defineProperty(ref, 'id', { value: id, enumerable: false });
      return ref;
    }),
    query: vi.fn((...args: any[]) => args[0]),
    orderBy: vi.fn((...args: any[]) => args),
    where: vi.fn((...args: any[]) => args),
    onSnapshot: vi.fn(),
    getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteDoc: vi.fn(() => Promise.resolve()),
    deleteField: vi.fn(() => 'DELETE_FIELD'),
    writeBatch: vi.fn(() => ({ set: batchSet, update: batchUpdate, delete: batchDelete, commit: batchCommit })),
  };
});

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
}));

const makeRhythm = (over?: Partial<Rhythm>): Rhythm => ({
  id: 'r1',
  name: 'Wednesday Bible Study',
  cadence: { type: 'weekly', days: [3] },
  roster: [],
  termStart: '2026-09-09',
  termEnd: '2026-09-16',
  createdAt: '2026-09-01T00:00:00.000Z',
  createdById: 'u1',
  ...over,
});

const makeGathering = (over?: Partial<Gathering>): Gathering => ({
  id: 'e1',
  name: 'Wednesday Bible Study',
  date: '2026-09-09',
  order: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('rhythms lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchCommit.mockResolvedValue(undefined);
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
  });

  describe('generateOccurrenceDates', () => {
    it('falls back to the last matching weekday when a month has no 5th occurrence', () => {
      const dates = generateOccurrenceDates(
        { type: 'monthly', days: [3], monthlyType: 'relative-day' },
        '2026-09-30',
        '2026-10-01',
        '2026-10-31',
      );
      expect(dates).toEqual(['2026-10-28']);
    });
  });

  describe('createRhythm', () => {
    it('writes the Rhythm and one event per generated occurrence, omitting an empty location', async () => {
      const id = await createRhythm({
        name: '  Wednesday Bible Study  ',
        cadence: { type: 'weekly', days: [3] },
        location: '   ',
        roster: ['c1'],
        termStart: '2026-09-09',
        termEnd: '2026-09-16',
        createdById: 'u1',
      });

      const rhythmWrite = batchSet.mock.calls[0];
      expect(rhythmWrite[0]).toEqual(expect.objectContaining({ path: 'rhythms' }));
      expect(id).toBe(rhythmWrite[0].id);
      expect(rhythmWrite[1]).toMatchObject({
        name: 'Wednesday Bible Study',
        cadence: { type: 'weekly', days: [3] },
        roster: ['c1'],
        termStart: '2026-09-09',
        termEnd: '2026-09-16',
        createdById: 'u1',
      });
      expect(rhythmWrite[1]).not.toHaveProperty('location');
      expect(batchSet).toHaveBeenCalledTimes(3);
      const events = batchSet.mock.calls.slice(1).map((call) => call[1]);
      expect(events.map((e) => e.date)).toEqual(['2026-09-09', '2026-09-16']);
      expect(events.every((e) => e.rhythmId === id)).toBe(true);
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it('trims and writes a provided location', async () => {
      await createRhythm({
        name: 'College Meeting',
        cadence: { type: 'weekly', days: [4] },
        location: '  Chapel  ',
        roster: [],
        termStart: '2026-09-10',
        termEnd: '2026-09-10',
        createdById: 'u1',
      });
      expect(batchSet.mock.calls[0][1].location).toBe('Chapel');
    });

    it('surfaces write failures through handleFirestoreError', async () => {
      batchCommit.mockRejectedValueOnce(new Error('denied'));
      await expect(createRhythm({
        name: 'Broken',
        cadence: { type: 'weekly', days: [3] },
        roster: [],
        termStart: '2026-09-09',
        termEnd: '2026-09-09',
        createdById: 'u1',
      })).rejects.toThrow('denied');
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'create', 'rhythms');
    });
  });

  describe('updateRhythm', () => {
    it('writes the provided fields', async () => {
      await updateRhythm('r1', { name: 'Renamed', roster: ['c1', 'c2'] });
      expect(updateDoc).toHaveBeenCalledWith(
        { path: 'rhythms/r1' },
        { name: 'Renamed', roster: ['c1', 'c2'] },
      );
    });

    it('trims and writes a location when provided', async () => {
      await updateRhythm('r1', { location: '  Chapel  ' });
      expect(updateDoc).toHaveBeenCalledWith({ path: 'rhythms/r1' }, { location: 'Chapel' });
    });

    it('deletes the location field when cleared with null or an empty string', async () => {
      await updateRhythm('r1', { name: 'Still here', location: null });
      expect(updateDoc).toHaveBeenCalledWith(
        { path: 'rhythms/r1' },
        { name: 'Still here', location: 'DELETE_FIELD' },
      );
      vi.mocked(updateDoc).mockClear();
      await updateRhythm('r1', { location: '   ' });
      expect(updateDoc).toHaveBeenCalledWith({ path: 'rhythms/r1' }, { location: 'DELETE_FIELD' });
    });

    it('leaves the location alone when it is omitted', async () => {
      await updateRhythm('r1', { roster: [] });
      const payload = vi.mocked(updateDoc).mock.calls[0][1] as unknown as Record<string, unknown>;
      expect(payload).toEqual({ roster: [] });
      expect(payload).not.toHaveProperty('location');
    });

    it('surfaces update failures', async () => {
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error('nope'));
      await updateRhythm('r1', { name: 'x' });
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'update', 'rhythms/r1');
    });
  });

  // Removing a Rhythm keeps the record (issue 982). Past occasions detach into
  // One-offs carrying the name, room and resolved roster they were recorded
  // with; future occasions, which have nothing recorded, go with the Rhythm.
  // The whole thing is one batch, so a failure never half-removes a schedule.
  describe('deleteRhythm', () => {
    const NOW = new Date('2026-09-16T12:00:00');

    it('deletes the Rhythm doc', async () => {
      await deleteRhythm(makeRhythm(), [], NOW);
      expect(batchDelete).toHaveBeenCalledWith({ path: 'rhythms/r1' });
    });

    it('detaches a past occasion instead of deleting it', async () => {
      const past = makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' });
      await deleteRhythm(makeRhythm(), [past], NOW);
      expect(batchDelete).not.toHaveBeenCalledWith({ path: 'events/e1' });
      expect(batchUpdate).toHaveBeenCalledWith(
        { path: 'events/e1' },
        expect.objectContaining({ rhythmId: 'DELETE_FIELD' }),
      );
    });

    it('writes the Rhythm name onto a detached occasion, so a past week keeps its identity', async () => {
      const past = makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1', name: 'stale' });
      await deleteRhythm(makeRhythm({ name: 'Wednesday Bible Study' }), [past], NOW);
      expect(batchUpdate).toHaveBeenCalledWith(
        { path: 'events/e1' },
        expect.objectContaining({ name: 'Wednesday Bible Study' }),
      );
    });

    it('writes the usual room onto a detached occasion that never moved', async () => {
      const past = makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' });
      await deleteRhythm(makeRhythm({ location: 'Cypress Hall' }), [past], NOW);
      expect(batchUpdate).toHaveBeenCalledWith(
        { path: 'events/e1' },
        expect.objectContaining({ location: 'Cypress Hall' }),
      );
    });

    it('leaves a detached occasion its own room when it moved that week', async () => {
      const past = makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1', location: 'Room 204' });
      await deleteRhythm(makeRhythm({ location: 'Cypress Hall' }), [past], NOW);
      expect(batchUpdate).toHaveBeenCalledWith(
        { path: 'events/e1' },
        expect.objectContaining({ location: 'Room 204' }),
      );
    });

    it('freezes the resolved roster onto a detached past occasion', async () => {
      // Past weeks are frozen by resolveRoster: what was recorded, not the
      // Rhythm as it stands. Without writing it down, a detached occasion
      // would resolve against nothing and stop counting anyone as missed.
      const past = makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1', roster: ['c1', 'c2'] });
      await deleteRhythm(makeRhythm({ roster: ['c9'] }), [past], NOW);
      expect(batchUpdate).toHaveBeenCalledWith(
        { path: 'events/e1' },
        expect.objectContaining({ roster: ['c1', 'c2'] }),
      );
    });

    it('clears the roster override, which means nothing once the Rhythm is gone', async () => {
      const past = makeGathering({
        id: 'e1',
        date: '2026-09-09',
        rhythmId: 'r1',
        roster: ['c1'],
        rosterOverride: ['c1', 'c2'],
        rosterOverrideBase: ['c1'],
      });
      await deleteRhythm(makeRhythm(), [past], NOW);
      expect(batchUpdate).toHaveBeenCalledWith(
        { path: 'events/e1' },
        expect.objectContaining({
          roster: ['c1', 'c2'],
          rosterOverride: 'DELETE_FIELD',
          rosterOverrideBase: 'DELETE_FIELD',
        }),
      );
    });

    it('leaves recorded attendance and a cancellation alone', async () => {
      const past = makeGathering({
        id: 'e1',
        date: '2026-09-09',
        rhythmId: 'r1',
        cancelled: true,
        attendance: { present: ['c1'], absent: [] },
      });
      await deleteRhythm(makeRhythm(), [past], NOW);
      const patch = batchUpdate.mock.calls.find((c) => c[0].path === 'events/e1')?.[1] ?? {};
      expect(patch).not.toHaveProperty('cancelled');
      expect(patch).not.toHaveProperty('attendance');
    });

    it('deletes a future occasion, which has nothing recorded to keep', async () => {
      const future = makeGathering({ id: 'e2', date: '2026-09-23', rhythmId: 'r1' });
      await deleteRhythm(makeRhythm(), [future], NOW);
      expect(batchDelete).toHaveBeenCalledWith({ path: 'events/e2' });
    });

    it('treats today as past, since this week may already carry attendance', async () => {
      const today = makeGathering({ id: 'e3', date: '2026-09-16', rhythmId: 'r1' });
      await deleteRhythm(makeRhythm(), [today], NOW);
      expect(batchDelete).not.toHaveBeenCalledWith({ path: 'events/e3' });
      expect(batchUpdate).toHaveBeenCalledWith({ path: 'events/e3' }, expect.anything());
    });

    it('ignores occasions belonging to some other Rhythm', async () => {
      const other = makeGathering({ id: 'other', date: '2026-09-09', rhythmId: 'r2' });
      await deleteRhythm(makeRhythm(), [other], NOW);
      expect(batchUpdate).not.toHaveBeenCalled();
      expect(batchDelete).toHaveBeenCalledTimes(1);
    });

    it('commits everything as one batch', async () => {
      const gatherings = [
        makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' }),
        makeGathering({ id: 'e2', date: '2026-09-23', rhythmId: 'r1' }),
      ];
      await deleteRhythm(makeRhythm(), gatherings, NOW);
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it('surfaces delete failures', async () => {
      batchCommit.mockRejectedValueOnce(new Error('nope'));
      await deleteRhythm(makeRhythm(), [], NOW);
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'delete', 'rhythms/r1');
    });
  });

  describe('extendRhythmTerm', () => {
    it('writes only the missing occurrences and advances termEnd', async () => {
      const existing = [
        makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' }),
        makeGathering({ id: 'e2', date: '2026-09-16', rhythmId: 'r1' }),
      ];
      await extendRhythmTerm(makeRhythm(), '2026-09-30', existing);
      const dates = batchSet.mock.calls.map((call) => call[1].date);
      expect(dates).toEqual(['2026-09-23', '2026-09-30']);
      expect(batchUpdate).toHaveBeenCalledWith({ path: 'rhythms/r1' }, { termEnd: '2026-09-30' });
    });

    it('surfaces extend failures', async () => {
      batchCommit.mockRejectedValueOnce(new Error('boom'));
      await extendRhythmTerm(makeRhythm(), '2026-09-30', []);
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'update', 'rhythms/r1');
    });
  });

  describe('repairRhythmOccurrences', () => {
    it('does nothing when every implied occurrence already exists', async () => {
      await repairRhythmOccurrences(makeRhythm(), [
        makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' }),
        makeGathering({ id: 'e2', date: '2026-09-16', rhythmId: 'r1' }),
      ]);
      expect(batchSet).not.toHaveBeenCalled();
      expect(batchCommit).not.toHaveBeenCalled();
    });

    it('fills a missing occurrence', async () => {
      await repairRhythmOccurrences(makeRhythm(), [makeGathering({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' })]);
      expect(batchSet).toHaveBeenCalledTimes(1);
      expect(batchSet.mock.calls[0][1].date).toBe('2026-09-16');
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it('surfaces repair failures', async () => {
      batchCommit.mockRejectedValueOnce(new Error('boom'));
      await repairRhythmOccurrences(makeRhythm(), []);
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'update', 'rhythms/r1');
    });
  });

  describe('cancel helpers', () => {
    it('marks a Gathering cancelled', async () => {
      await cancelGatheringForRhythm('e1');
      expect(updateDoc).toHaveBeenCalledWith({ path: 'events/e1' }, { cancelled: true });
    });

    it('undoes a cancellation', async () => {
      await uncancelGatheringDoc('e1');
      expect(updateDoc).toHaveBeenCalledWith({ path: 'events/e1' }, { cancelled: false });
    });

    it('routes cancellation failures through handleFirestoreError', async () => {
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error('nope'));
      await cancelGatheringForRhythm('e1');
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'update', 'events/e1');
    });
  });

  describe('fetchRhythmGatherings', () => {
    it('maps snapshot docs to Gatherings', async () => {
      vi.mocked(getDocs).mockResolvedValueOnce({
        docs: [{ id: 'e1', data: () => ({ name: 'Wed', date: '2026-09-09', order: 0, rhythmId: 'r1', createdAt: 'x' }) }],
      } as any);
      const rows = await fetchRhythmGatherings('r1');
      expect(rows).toEqual([{ id: 'e1', name: 'Wed', date: '2026-09-09', order: 0, rhythmId: 'r1', createdAt: 'x' }]);
    });
  });

  describe('subscribeRhythms', () => {
    it('maps snapshot docs and returns the Firestore unsubscribe', () => {
      const unsubscribe = vi.fn();
      vi.mocked(onSnapshot).mockImplementation((_ref: any, next: any) => {
        next({
          docs: [{
            id: 'r1',
            data: () => ({ name: 'Wednesday Bible Study', cadence: { type: 'weekly', days: [3] }, roster: [], termStart: '2026-09-09', termEnd: '2026-12-23', createdAt: 'x', createdById: 'u1' }),
          }],
        });
        return unsubscribe;
      });
      const cb = vi.fn();
      const returned = subscribeRhythms(cb);
      expect(cb).toHaveBeenCalledWith([expect.objectContaining({ id: 'r1', name: 'Wednesday Bible Study' })]);
      expect(returned).toBe(unsubscribe);
    });

    it('reports subscription errors to the caller', () => {
      vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError: any) => {
        onError(new Error('boom'));
        return vi.fn();
      });
      const onError = vi.fn();
      subscribeRhythms(vi.fn(), onError);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('logs when no error handler is passed', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, onError: any) => {
        onError(new Error('boom'));
        return vi.fn();
      });
      subscribeRhythms(vi.fn());
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
