import { describe, it, expect, vi, beforeEach } from 'vitest';

const batch = { set: vi.fn(), update: vi.fn(), commit: vi.fn(() => Promise.resolve()) };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  doc: vi.fn((_db, path, id) => ({ path, id: id ?? 'auto-id' })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  where: vi.fn((field, _op, value) => ({ field, value })),
  onSnapshot: vi.fn((_ref, cb) => {
    cb({
      docs: [
        { id: 't1', data: () => ({ name: 'Weekly', blurb: 'Friday night', order: 0 }) },
        { id: 't2', data: () => ({ name: 'Small Group', order: 1 }) },
      ],
    });
    return vi.fn();
  }),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-id' })),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(),
  writeBatch: vi.fn(() => batch),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

import {
  subscribeGatheringTypes,
  blurbOf,
  addGatheringType,
  updateGatheringType,
  removeGatheringType,
  seedDefaultGatheringTypesIfEmpty,
  DEFAULT_GATHERING_TYPES,
} from '../lib/gatheringTypes';
import { addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('gatheringTypes lib', () => {
  it('maps snapshot docs (defaulting a missing blurb)', () => {
    const cb = vi.fn();
    subscribeGatheringTypes(cb);
    expect(cb).toHaveBeenCalledWith([
      { id: 't1', name: 'Weekly', blurb: 'Friday night', order: 0 },
      { id: 't2', name: 'Small Group', blurb: '', order: 1 },
    ]);
  });

  it('blurbOf finds a type blurb, else empty', () => {
    const types = [{ id: 't1', name: 'Weekly', blurb: 'Friday night', order: 0 }];
    expect(blurbOf(types, 'Weekly')).toBe('Friday night');
    expect(blurbOf(types, 'Nope')).toBe('');
    expect(blurbOf(types, undefined)).toBe('');
  });

  it('adds a type with trimmed fields', async () => {
    await addGatheringType({ name: '  Prayer Walk  ', blurb: '  on campus  ', order: 4 });
    expect(addDoc).toHaveBeenCalledWith(expect.anything(), {
      name: 'Prayer Walk',
      blurb: 'on campus',
      order: 4,
    });
  });

  it('updates blurb only (no event migration when the name is unchanged)', async () => {
    await updateGatheringType('t1', { name: 'Weekly', blurb: 'New blurb' }, 'Weekly');
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { name: 'Weekly', blurb: 'New blurb' });
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('remaps events carrying the old name when a type is renamed', async () => {
    (getDocs as any).mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: { id: 'e1' } }, { ref: { id: 'e2' } }],
    });
    await updateGatheringType('t1', { name: 'Friday Gathering', blurb: '' }, 'Weekly');
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { name: 'Friday Gathering', blurb: '' });
    expect(getDocs).toHaveBeenCalled();
    expect(batch.update).toHaveBeenCalledTimes(2);
    expect(batch.update).toHaveBeenCalledWith({ id: 'e1' }, { type: 'Friday Gathering' });
    expect(batch.commit).toHaveBeenCalled();
  });

  it('removes a type', async () => {
    await removeGatheringType('t2');
    expect(deleteDoc).toHaveBeenCalled();
  });

  it('seeds defaults only when the collection is empty', async () => {
    (getDocs as any).mockResolvedValueOnce({ empty: true });
    await seedDefaultGatheringTypesIfEmpty();
    expect(batch.set).toHaveBeenCalledTimes(DEFAULT_GATHERING_TYPES.length);
    expect(batch.commit).toHaveBeenCalled();

    vi.clearAllMocks();
    (getDocs as any).mockResolvedValueOnce({ empty: false });
    await seedDefaultGatheringTypesIfEmpty();
    expect(batch.set).not.toHaveBeenCalled();
  });
});
