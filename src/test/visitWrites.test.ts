// The write half of src/lib/visits.ts — chiefly the mirroring, which is the
// part with a rule constraint hiding in it: an interaction may only be created
// with a server `createdAt`, and may only be updated on a narrow set of keys.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { addVisit, attachVisitPhotos, deleteVisit, subscribeVisits, updateVisit } from '../lib/visits';
import type { VisitInput } from '../lib/visits';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: 'v-new' })),
  collection: vi.fn((_db, ...path) => ({ kind: 'collection', path: path.join('/') })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((_db, ...path) => ({ kind: 'doc', path: path.join('/') })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  onSnapshot: vi.fn(() => vi.fn()),
  orderBy: vi.fn((f, d) => ({ orderBy: f, dir: d })),
  query: vi.fn((ref, ...rest) => ({ ...ref, constraints: rest })),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const input = (overrides: Partial<VisitInput> = {}): VisitInput => ({
  date: '2026-08-13',
  contactIds: ['c1'],
  contactNames: ['Ama Osei'],
  went: ['u1'],
  wentNames: ['Mei Tanaka'],
  where: '  Whitman Hall  ',
  purpose: '  ',
  how: '  Sat on the floor.  ',
  followUp: '  ',
  ...overrides,
});

const by = { uid: 'u1', name: 'Mei Tanaka', photoURL: '' };

beforeEach(() => {
  vi.clearAllMocks();
  mock(addDoc).mockResolvedValue({ id: 'v-new' });
  mock(getDoc).mockResolvedValue({ exists: () => false });
});

describe('subscribeVisits', () => {
  it('reads the record newest first and maps ids onto the docs', () => {
    const cb = vi.fn();
    mock(onSnapshot).mockImplementation((_ref: unknown, next: (s: unknown) => void) => {
      next({ docs: [{ id: 'v1', data: () => ({ date: '2026-08-13' }) }] });
      return vi.fn();
    });

    subscribeVisits(cb);
    expect(collection).toHaveBeenCalledWith({}, 'visits');
    expect(orderBy).toHaveBeenCalledWith('date', 'desc');
    expect(cb).toHaveBeenCalledWith([{ id: 'v1', date: '2026-08-13' }]);
    expect(query).toHaveBeenCalled();
  });

  it('hands a failed read to the caller', () => {
    const onError = vi.fn();
    mock(onSnapshot).mockImplementation((_r: unknown, _n: unknown, err: (e: unknown) => void) => {
      err(new Error('denied'));
      return vi.fn();
    });
    subscribeVisits(vi.fn(), onError);
    expect(onError).toHaveBeenCalled();
  });
});

describe('addVisit', () => {
  it('trims the write-up and stamps who wrote it', async () => {
    const id = await addVisit(input(), by);
    expect(id).toBe('v-new');
    const [, payload] = mock(addDoc).mock.calls[0];
    expect(payload).toMatchObject({
      where: 'Whitman Hall',
      how: 'Sat on the floor.',
      purpose: '',
      followUp: '',
      followUpTaskId: null,
      prayerId: null,
      prayerBurden: null,
      photos: [],
      createdById: 'u1',
      createdByName: 'Mei Tanaka',
    });
  });

  it("keeps the prayer's own words on the visit, so the card need not go looking", async () => {
    await addVisit(input({ prayerId: 'p1', prayerBurden: "  Her mum's recovery  " }), by);
    const [, payload] = mock(addDoc).mock.calls[0];
    expect(payload).toMatchObject({ prayerId: 'p1', prayerBurden: "Her mum's recovery" });
  });

  it('mirrors the visit onto each person, with a server timestamp the rules require', async () => {
    await addVisit(input({ contactIds: ['c1', 'c2'], contactNames: ['Ama', 'Bo'] }), by);

    expect(setDoc).toHaveBeenCalledTimes(2);
    const [ref, mirror] = mock(setDoc).mock.calls[0];
    expect(ref.path).toBe('contacts/c1/interactions/visit_v-new');
    expect(mirror).toMatchObject({
      userId: 'u1',
      userName: 'Mei Tanaka',
      content: 'Visited at Whitman Hall — Sat on the floor.',
      dateTime: '2026-08-13',
      type: 'visit',
      createdAt: 'SERVER_TIME',
    });
    expect(serverTimestamp).toHaveBeenCalled();
  });

  it('moves each person’s last seen, touching only the fields the rules allow', async () => {
    await addVisit(input(), by);
    const contactUpdate = mock(updateDoc).mock.calls.find((c) => c[0].path === 'contacts/c1');
    expect(contactUpdate).toBeDefined();
    expect(Object.keys(contactUpdate![1]).sort()).toEqual([
      'lastSeen',
      'updatedAt',
      'updatedBy',
      'updatedByName',
    ]);
  });

  it('does not fail the save when a contact refuses the last-seen bump', async () => {
    mock(updateDoc).mockRejectedValueOnce(new Error('permission-denied'));
    await expect(addVisit(input(), by)).resolves.toBe('v-new');
  });
});

describe('updateVisit', () => {
  it('patches an existing mirror rather than re-creating it', async () => {
    mock(getDoc).mockResolvedValue({ exists: () => true });
    await updateVisit('v1', ['c1'], input(), by);

    expect(setDoc).not.toHaveBeenCalled();
    const mirrorUpdate = mock(updateDoc).mock.calls.find(
      (c) => c[0].path === 'contacts/c1/interactions/visit_v1',
    );
    // Only the keys the interactions update rule permits — never userId or createdAt.
    expect(Object.keys(mirrorUpdate![1]).sort()).toEqual(['content', 'dateTime', 'type', 'userName']);
  });

  it('drops the copy from anyone taken off the visit', async () => {
    mock(getDoc).mockResolvedValue({ exists: () => true });
    await updateVisit('v1', ['c1', 'c2'], input({ contactIds: ['c1'] }), by);

    expect(deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'contacts/c2/interactions/visit_v1' }),
    );
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('creates a copy for anyone newly added to the visit', async () => {
    mock(getDoc).mockResolvedValue({ exists: () => false });
    await updateVisit('v1', ['c1'], input({ contactIds: ['c1', 'c2'], contactNames: ['Ama', 'Bo'] }), by);
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});

describe('attachVisitPhotos', () => {
  it('stores the uploaded photos on the visit that already exists', async () => {
    await attachVisitPhotos('v1', [{ path: 'visits/v1/1.jpg', url: 'u' }]);
    expect(doc).toHaveBeenCalledWith({}, 'visits', 'v1');
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      photos: [{ path: 'visits/v1/1.jpg', url: 'u' }],
    });
  });
});

describe('deleteVisit', () => {
  it('removes the visit and every copy of it', async () => {
    await deleteVisit({ id: 'v1', contactIds: ['c1', 'c2'] });
    const paths = mock(deleteDoc).mock.calls.map((c) => c[0].path);
    expect(paths).toEqual([
      'contacts/c1/interactions/visit_v1',
      'contacts/c2/interactions/visit_v1',
      'visits/v1',
    ]);
  });

  it('still removes the record when a copy has already gone', async () => {
    mock(deleteDoc).mockRejectedValueOnce(new Error('not-found'));
    await expect(deleteVisit({ id: 'v1', contactIds: ['c1'] })).resolves.toBeUndefined();
    expect(mock(deleteDoc).mock.calls.at(-1)![0].path).toBe('visits/v1');
  });
});
