import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isHomeUnvisited,
  combinedHomeFields,
  combineHomes,
  deleteHome,
  restoreHome,
} from '../lib/homes';
import { deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import type { Home, Visit } from '../types';

vi.mock('../lib/firebase', () => ({ db: { _type: 'firestore' } }));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn((_db, name, id) => ({ path: `${name}/${id}` })),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(() => Promise.resolve()),
  setDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
}));

const home = (over: Partial<Home> & Pick<Home, 'id'>): Home => ({
  label: 'the Oseis',
  members: ['c1'],
  active: true,
  ...over,
});

const visit = (id: string, homeId?: string | null): Visit =>
  ({ id, homeId, contactIds: [], date: '2026-08-01' }) as Visit;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isHomeUnvisited', () => {
  it('is true when no visit was logged against the home', () => {
    expect(isHomeUnvisited('h1', [visit('v1', undefined), visit('v2', 'h2')])).toBe(true);
  });

  it('is false once a visit points at the home', () => {
    expect(isHomeUnvisited('h1', [visit('v1', 'h1')])).toBe(false);
  });

  it('does not count visits that point nowhere (co-visit history predates homes)', () => {
    expect(isHomeUnvisited('h1', [visit('v1', null)])).toBe(true);
  });
});

describe('combinedHomeFields', () => {
  it('keeps the kept home label and place, backfilling only where empty', () => {
    const kept = home({ id: 'k', label: 'the Garcias', place: 'Hall 3' });
    const other = home({ id: 'd', label: 'the Garcias (2)', place: 'Hall 9' });
    expect(combinedHomeFields(kept, other)).toMatchObject({ label: 'the Garcias', place: 'Hall 3' });
  });

  it('backfills place from the combined-in home when the kept one is empty', () => {
    const kept = home({ id: 'k', place: '' });
    const other = home({ id: 'd', place: 'Hall 9' });
    expect(combinedHomeFields(kept, other).place).toBe('Hall 9');
  });

  it('takes the union of members, kept home first', () => {
    const kept = home({ id: 'k', members: ['c1', 'c2'] });
    const other = home({ id: 'd', members: ['c2', 'c3'] });
    expect(combinedHomeFields(kept, other).members).toEqual(['c1', 'c2', 'c3']);
  });

  it('keeps both notes with the kept home first', () => {
    const kept = home({ id: 'k', notes: 'Kept note' });
    const other = home({ id: 'd', notes: 'Other note' });
    const { notes } = combinedHomeFields(kept, other);
    expect(notes.indexOf('Kept note')).toBeLessThan(notes.indexOf('Other note'));
  });

  it('backfills notes when the kept home has none', () => {
    const kept = home({ id: 'k', notes: '' });
    const other = home({ id: 'd', notes: 'Other note' });
    expect(combinedHomeFields(kept, other).notes).toBe('Other note');
  });

  it('keeps the kept home active flag', () => {
    const kept = home({ id: 'k', active: false });
    const other = home({ id: 'd', active: true });
    expect(combinedHomeFields(kept, other).active).toBe(false);
  });
});

describe('combineHomes', () => {
  const by = { uid: 'u1', name: 'Mei Tanaka' };

  it('updates the kept home, repoints its visits, and deletes the combined-in home in one batch', async () => {
    const kept = home({ id: 'k', members: ['c1'] });
    const other = home({ id: 'd', members: ['c2'] });
    const visits = [visit('v1', 'd'), visit('v2', 'k'), visit('v3', null)];
    await combineHomes(kept, other, visits, by);

    const batch = (writeBatch as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(batch.update).toHaveBeenCalledWith(
      { path: 'homes/k' },
      expect.objectContaining({ members: ['c1', 'c2'], updatedBy: 'u1', updatedByName: 'Mei Tanaka' }),
    );
    expect(batch.update).toHaveBeenCalledWith({ path: 'visits/v1' }, { homeId: 'k' });
    expect(batch.update).not.toHaveBeenCalledWith({ path: 'visits/v2' }, expect.anything());
    expect(batch.delete).toHaveBeenCalledWith({ path: 'homes/d' });
    expect(batch.commit).toHaveBeenCalled();
  });

  it('does not repoint anything when the combined-in home has no visits', async () => {
    await combineHomes(home({ id: 'k' }), home({ id: 'd' }), [visit('v1', 'k')], by);
    const batch = (writeBatch as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.delete).toHaveBeenCalledWith({ path: 'homes/d' });
  });
});

describe('deleteHome / restoreHome', () => {
  it('deletes the home by id', async () => {
    await deleteHome('h1');
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'homes/h1' });
  });

  it('restores a deleted home under the same id', async () => {
    await restoreHome(home({ id: 'h1', label: 'the Chens', members: ['c3'] }), {
      uid: 'u1',
      name: 'Mei Tanaka',
    });
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'homes/h1' },
      expect.objectContaining({ label: 'the Chens', members: ['c3'], active: true, updatedBy: 'u1' }),
    );
  });
});
