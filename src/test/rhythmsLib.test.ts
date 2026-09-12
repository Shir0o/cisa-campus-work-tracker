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
    writeBatch: vi.fn(() => ({ set: batchSet, update: batchUpdate, commit: batchCommit })),
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

  describe('deleteRhythm', () => {
    it('deletes the Rhythm doc', async () => {
      await deleteRhythm('r1');
      expect(deleteDoc).toHaveBeenCalledWith({ path: 'rhythms/r1' });
    });

    it('surfaces delete failures', async () => {
      vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('nope'));
      await deleteRhythm('r1');
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
