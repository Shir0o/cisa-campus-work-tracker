import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc, collection, updateDoc } from 'firebase/firestore';
import {
  addPrayerBurden,
  isTeamPrayer,
  updatePrayerStatus,
  getContactGrade,
  isContactBrother,
  isContactSister,
  sortPrayerEntries,
  unhidePrayerContact,
} from '../lib/prayers';
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
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts a burden on the prayer page, hands back its id, and unhides the contact', async () => {
    localStorage.setItem('cisa.prayer.hidden', JSON.stringify(['c1', 'c2']));
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
    // Verify auto-unhide from localStorage
    expect(JSON.parse(localStorage.getItem('cisa.prayer.hidden')!)).toEqual(['c2']);
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

describe('getContactGrade', () => {
  it('prefers direct year field', () => {
    expect(getContactGrade({ year: 'Freshman', tags: ['Senior'] })).toBe('Freshman');
  });

  it('falls back to grade/year tags', () => {
    expect(getContactGrade({ tags: ['Sophomore', 'Campus'] })).toBe('Sophomore');
    expect(getContactGrade({ tags: ['1st year'] })).toBe('1st year');
  });

  it('returns undefined when no year info is present', () => {
    expect(getContactGrade({ tags: ['Campus'] })).toBeUndefined();
    expect(getContactGrade({})).toBeUndefined();
  });
});

describe('isContactBrother & isContactSister', () => {
  it('identifies brothers by gender value', () => {
    expect(isContactBrother({ gender: 'Male' })).toBe(true);
    expect(isContactBrother({ gender: 'Brother' })).toBe(true);
    expect(isContactBrother({ gender: 'm' })).toBe(true);
  });

  it('identifies brothers by pronouns or tags', () => {
    expect(isContactBrother({ pronouns: 'he/him' })).toBe(true);
    expect(isContactBrother({ tags: ['Brother', 'Fall 2026'] })).toBe(true);
  });

  it('identifies sisters by gender value', () => {
    expect(isContactSister({ gender: 'Female' })).toBe(true);
    expect(isContactSister({ gender: 'Sister' })).toBe(true);
    expect(isContactSister({ gender: 'f' })).toBe(true);
  });

  it('identifies sisters by pronouns or tags', () => {
    expect(isContactSister({ pronouns: 'she/her' })).toBe(true);
    expect(isContactSister({ tags: ['Sister'] })).toBe(true);
  });

  it('returns false when no matching gender metadata', () => {
    expect(isContactBrother({ gender: 'Female' })).toBe(false);
    expect(isContactSister({ gender: 'Male' })).toBe(false);
    expect(isContactBrother({})).toBe(false);
    expect(isContactSister({})).toBe(false);
  });
});

describe('sortPrayerEntries', () => {
  interface TestPrayer {
    ms: number;
    status?: string;
  }

  it('sorts by last name, then first name', () => {
    const entries: { contact: { name: string }; prayers: TestPrayer[] }[] = [
      { contact: { name: 'Alice Smith' }, prayers: [{ ms: 0 }] },
      { contact: { name: 'Zoe Johnson' }, prayers: [{ ms: 0 }] },
      { contact: { name: 'Bob Adams' }, prayers: [{ ms: 0 }] },
      { contact: { name: 'Carol Adams' }, prayers: [{ ms: 0 }] },
    ];
    const sorted = sortPrayerEntries(entries);
    // Last name dominates (Adams first even though "Alice" sorts early), then
    // first name breaks ties within a family (Bob before Carol).
    expect(sorted.map((e) => e.contact.name)).toEqual([
      'Bob Adams',
      'Carol Adams',
      'Zoe Johnson',
      'Alice Smith',
    ]);
  });

  it('is case-insensitive and unaffected by prayer recency', () => {
    const entries = [
      { contact: { name: 'amy adams' }, prayers: [{ ms: 0 }] },
      { contact: { name: 'Zoe Baker' }, prayers: [{ ms: 500 }] },
      { contact: { name: 'Ann Adams' }, prayers: [{ ms: 100 }] },
    ];
    const sorted = sortPrayerEntries(entries);
    // Adams (Amy then Ann, compared case-insensitively) before Baker (Zoe);
    // recency is ignored.
    expect(sorted.map((e) => e.contact.name)).toEqual([
      'amy adams',
      'Ann Adams',
      'Zoe Baker',
    ]);
  });

  it('does not mutate the input array', () => {
    const entries = [
      { contact: { name: 'Bob Smith' }, prayers: [] },
      { contact: { name: 'Alice Johnson' }, prayers: [] },
    ];
    const before = entries.map((e) => e.contact.name);
    sortPrayerEntries(entries);
    expect(entries.map((e) => e.contact.name)).toEqual(before);
  });
});

describe('unhidePrayerContact', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes a hidden contact ID from localStorage', () => {
    localStorage.setItem('cisa.prayer.hidden', JSON.stringify(['c1', 'c2', 'c3']));
    unhidePrayerContact('c2');
    expect(JSON.parse(localStorage.getItem('cisa.prayer.hidden')!)).toEqual(['c1', 'c3']);
  });

  it('is a no-op when the contact is not in the hidden set', () => {
    localStorage.setItem('cisa.prayer.hidden', JSON.stringify(['c1']));
    unhidePrayerContact('c99');
    expect(JSON.parse(localStorage.getItem('cisa.prayer.hidden')!)).toEqual(['c1']);
  });

  it('is a no-op when localStorage has no hidden key', () => {
    expect(() => unhidePrayerContact('c1')).not.toThrow();
    expect(localStorage.getItem('cisa.prayer.hidden')).toBeNull();
  });

  it('handles corrupt JSON gracefully without throwing', () => {
    localStorage.setItem('cisa.prayer.hidden', '{not-valid-json');
    expect(() => unhidePrayerContact('c1')).not.toThrow();
  });
});


