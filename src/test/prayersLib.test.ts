import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc, collection, updateDoc } from 'firebase/firestore';
import {
  addPrayerBurden,
  isTeamPrayer,
  updatePrayerStatus,
  getContactGrade,
  getContactCaregiver,
  getContactAddedBy,
  isContactBrother,
  isContactSister,
  sortPrayerEntries,
  unhidePrayerContact,
  STALE_INTERACTION_DAYS,
  getDaysSinceLastInteraction,
  isContactStale,
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

describe('getContactCaregiver & getContactAddedBy', () => {
  const team = [
    { uid: 'u1', name: 'Mei Tanaka' },
    { uid: 'u2', name: 'Tony Wang' },
  ];

  it('resolves caregiver from owner in team', () => {
    expect(getContactCaregiver({ owner: 'u1' }, team)).toBe('Mei Tanaka');
  });

  it('resolves caregiver falling back to createdByName or addedBy when owner is missing', () => {
    expect(getContactCaregiver({ createdByName: 'Tony Wang' }, team)).toBe('Tony Wang');
    expect(getContactCaregiver({ addedBy: 'u2' }, team)).toBe('Tony Wang');
    expect(getContactCaregiver({}, team)).toBeUndefined();
  });

  it('resolves addedBy from createdByName first, then addedBy uid in team', () => {
    expect(getContactAddedBy({ createdByName: 'Tony Wang' }, team)).toBe('Tony Wang');
    expect(getContactAddedBy({ addedBy: 'u1' }, team)).toBe('Mei Tanaka');
    expect(getContactAddedBy({}, team)).toBeUndefined();
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

describe('getDaysSinceLastInteraction', () => {
  const baseNow = new Date('2026-08-26T12:00:00Z').getTime();

  it('returns null when contact has no lastContactedDate and no lastSeen', () => {
    expect(getDaysSinceLastInteraction({}, baseNow)).toBeNull();
    expect(getDaysSinceLastInteraction({ lastContactedDate: undefined, lastSeen: undefined }, baseNow)).toBeNull();
    expect(getDaysSinceLastInteraction({ lastContactedDate: '' }, baseNow)).toBeNull();
  });

  it('computes days elapsed accurately from lastContactedDate', () => {
    // 0 days ago (same day)
    const today = new Date('2026-08-26T08:00:00Z').toISOString();
    expect(getDaysSinceLastInteraction({ lastContactedDate: today }, baseNow)).toBe(0);

    // 1 day ago
    const oneDayAgo = new Date('2026-08-25T12:00:00Z').toISOString();
    expect(getDaysSinceLastInteraction({ lastContactedDate: oneDayAgo }, baseNow)).toBe(1);

    // 29 days ago
    const d29 = new Date(baseNow - 29 * 86_400_000).toISOString();
    expect(getDaysSinceLastInteraction({ lastContactedDate: d29 }, baseNow)).toBe(29);

    // 30 days ago
    const d30 = new Date(baseNow - 30 * 86_400_000).toISOString();
    expect(getDaysSinceLastInteraction({ lastContactedDate: d30 }, baseNow)).toBe(30);

    // 31 days ago
    const d31 = new Date(baseNow - 31 * 86_400_000).toISOString();
    expect(getDaysSinceLastInteraction({ lastContactedDate: d31 }, baseNow)).toBe(31);
  });

  it('falls back to lastSeen if lastContactedDate is not present', () => {
    const d10 = new Date(baseNow - 10 * 86_400_000).toISOString();
    expect(getDaysSinceLastInteraction({ lastSeen: d10 }, baseNow)).toBe(10);
  });

  it('prefers lastContactedDate over lastSeen if both are present', () => {
    const d5 = new Date(baseNow - 5 * 86_400_000).toISOString();
    const d20 = new Date(baseNow - 20 * 86_400_000).toISOString();
    expect(getDaysSinceLastInteraction({ lastContactedDate: d5, lastSeen: d20 }, baseNow)).toBe(5);
  });

  it('handles invalid date strings gracefully returning null', () => {
    expect(getDaysSinceLastInteraction({ lastContactedDate: 'not-a-date' }, baseNow)).toBeNull();
  });
});

describe('isContactStale', () => {
  const baseNow = new Date('2026-08-26T12:00:00Z').getTime();

  it('is stale (true) if contact has zero recorded interactions', () => {
    expect(isContactStale({}, STALE_INTERACTION_DAYS, baseNow)).toBe(true);
    expect(isContactStale({ lastContactedDate: undefined }, STALE_INTERACTION_DAYS, baseNow)).toBe(true);
  });

  it('checks threshold boundaries (>30 days)', () => {
    const d29 = new Date(baseNow - 29 * 86_400_000).toISOString();
    const d30 = new Date(baseNow - 30 * 86_400_000).toISOString();
    const d31 = new Date(baseNow - 31 * 86_400_000).toISOString();

    // 29 days: not stale
    expect(isContactStale({ lastContactedDate: d29 }, 30, baseNow)).toBe(false);

    // 30 days: not stale (threshold is >30)
    expect(isContactStale({ lastContactedDate: d30 }, 30, baseNow)).toBe(false);

    // 31 days: stale
    expect(isContactStale({ lastContactedDate: d31 }, 30, baseNow)).toBe(true);
  });

  it('uses STALE_INTERACTION_DAYS default threshold (30)', () => {
    const d20 = new Date(baseNow - 20 * 86_400_000).toISOString();
    const d45 = new Date(baseNow - 45 * 86_400_000).toISOString();

    expect(isContactStale({ lastContactedDate: d20 }, undefined, baseNow)).toBe(false);
    expect(isContactStale({ lastContactedDate: d45 }, undefined, baseNow)).toBe(true);
  });
});


