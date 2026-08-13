import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc, collection, updateDoc } from 'firebase/firestore';
import { addPrayerBurden, isTeamPrayer, reconcilePrayerOrder, updatePrayerStatus } from '../lib/prayers';
import { handleFirestoreError } from '../lib/firebase';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: 'p-new' })),
  collection: vi.fn((_db, path) => ({ path })),
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE' },
}));

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;
const by = { uid: 'u1', name: 'Mei Tanaka' };

beforeEach(() => {
  vi.clearAllMocks();
  mock(addDoc).mockResolvedValue({ id: 'p-new' });
});

describe('addPrayerBurden', () => {
  it('starts a burden on the prayer page and hands back its id', async () => {
    const id = await addPrayerBurden('c1', '  Peace for her dad  ', by);
    expect(id).toBe('p-new');
    expect(collection).toHaveBeenCalledWith({}, 'prayers');
    expect(mock(addDoc).mock.calls[0][1]).toMatchObject({
      contactId: 'c1',
      burden: 'Peace for her dad',
      status: 'pending',
      prayerPage: true,
      updatedBy: 'u1',
      updatedByName: 'Mei Tanaka',
    });
  });

  it('writes nothing for an empty burden or a missing person', async () => {
    expect(await addPrayerBurden('c1', '   ', by)).toBeNull();
    expect(await addPrayerBurden('', 'Something', by)).toBeNull();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of pretending it worked', async () => {
    mock(addDoc).mockRejectedValueOnce(new Error('permission-denied'));
    expect(await addPrayerBurden('c1', 'Peace', by)).toBeNull();
    expect(handleFirestoreError).toHaveBeenCalled();
  });
});

describe('updatePrayerStatus', () => {
  it('stamps who changed it, and only writes an answer when one is given', async () => {
    await updatePrayerStatus('p1', 'answered', by, 'He came home.', '2026-08-13');
    expect(mock(updateDoc).mock.calls[0][1]).toMatchObject({
      status: 'answered',
      answer: 'He came home.',
      answeredAt: '2026-08-13',
      updatedBy: 'u1',
    });

    vi.clearAllMocks();
    await updatePrayerStatus('p1', 'ongoing', by);
    expect(Object.keys(mock(updateDoc).mock.calls[0][1])).not.toContain('answer');
  });
});

describe('isTeamPrayer', () => {
  it('treats an absent flag as the team’s, so old prayers need no backfill', () => {
    expect(isTeamPrayer({})).toBe(true);
    expect(isTeamPrayer({ teamPrayer: true })).toBe(true);
    expect(isTeamPrayer({ teamPrayer: false })).toBe(false);
  });
});

describe('reconcilePrayerOrder', () => {
  it('keeps a card in place even when the needs-attention sort reorders under it', () => {
    // Marking a last-week prayer flips "needs attention" off, which re-sorts
    // the page; the remembered order must win so the card stays put (#268).
    expect(reconcilePrayerOrder(['c1', 'c2'], ['c2', 'c1'])).toEqual(['c1', 'c2']);
  });

  it('inserts new people at the top and drops people who left the page', () => {
    expect(reconcilePrayerOrder(['c1', 'c2'], ['c3', 'c1', 'c2'])).toEqual(['c3', 'c1', 'c2']);
    expect(reconcilePrayerOrder(['c1', 'c2', 'c3'], ['c1', 'c3'])).toEqual(['c1', 'c3']);
  });

  it('seeds the order on first render', () => {
    expect(reconcilePrayerOrder([], ['c2', 'c1'])).toEqual(['c2', 'c1']);
  });

  it('returns the same array reference when nothing changed', () => {
    const prev = ['c1', 'c2'];
    expect(reconcilePrayerOrder(prev, ['c1', 'c2'])).toBe(prev);
  });
});
