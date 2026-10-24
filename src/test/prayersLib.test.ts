import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc, collection, deleteField, updateDoc } from 'firebase/firestore';
import {
  addPrayerBurden,
  addTeamPrayer,
  isTeamPrayer,
  updatePrayerStatus,
  getContactGrade,
  getContactCarers,
  getContactAddedBy,
  isContactBrother,
  isContactSister,
  sortPrayerEntries,
  removeFromTeamPrayerList,
  restoreToTeamPrayerList,
  STALE_INTERACTION_DAYS,
  getDaysSinceLastInteraction,
  isContactStale,
  prayerCarrySummary,
  isPlaceholderPrayerBurden,
  PRAYER_PLACEHOLDER_BURDENS,
} from '../lib/prayers';
import en from '../locales/en.json';
import es from '../locales/es.json';
import { handleFirestoreError } from '../lib/firebase';

const hoisted = vi.hoisted(() => {
  const removed = { __deleteField: true };
  return {
    removed,
    batchSet: vi.fn(),
    batchUpdate: vi.fn(),
    batchCommit: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve({ id: 'p-new' })),
  collection: vi.fn((_db, path) => ({ path })),
  doc: vi.fn((_db, ...parts) => {
    if (parts.length === 0 && _db?.path) return { path: _db.path, id: 'p-new' };
    if (parts.length === 1 && parts[0]?.path) return { path: parts[0].path, id: 'p-new' };
    return { path: parts.join('/') };
  }),
  deleteField: vi.fn(() => hoisted.removed),
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({
    set: hoisted.batchSet,
    update: hoisted.batchUpdate,
    commit: hoisted.batchCommit,
  })),
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
  hoisted.batchCommit.mockResolvedValue(undefined);
});

describe('addPrayerBurden', () => {
  it('saves a visit prayer as the contact’s own and writes nothing to the contact (#1406)', async () => {
    const id = await addPrayerBurden('c1', '  Peace for her dad  ', by, false);
    expect(id).toBe('p-new');
    expect(collection).toHaveBeenCalledWith({}, 'prayers');
    expect(mock(addDoc).mock.calls[0][1]).toMatchObject({
      contactId: 'c1',
      burden: 'Peace for her dad',
      status: 'pending',
      // An off-page prayer belongs to the contact, not the team (#1406).
      teamPrayer: false,
      updatedBy: 'u1',
      updatedByName: 'Mei Tanaka',
    });
    // `prayerPage` means "written on the prayer page"; a visit isn't that page.
    expect(mock(addDoc).mock.calls[0][1]).not.toHaveProperty('prayerPage');
    // Logging a visit must not put the person back on "On our hearts" (#1406).
    expect(updateDoc).not.toHaveBeenCalled();
    expect(hoisted.batchUpdate).not.toHaveBeenCalled();
  });

  it('delegates a team burden to addTeamPrayer, clearing any team removal (#1692)', async () => {
    const id = await addPrayerBurden('c1', 'Peace', by, true);
    expect(id).toBe('p-new');
    expect(addDoc).not.toHaveBeenCalled();
    expect(hoisted.batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'prayers' }),
      expect.objectContaining({ contactId: 'c1', burden: 'Peace', teamPrayer: true, status: 'pending' }),
    );
    // A burden added off the prayer page keeps no `prayerPage` stamp.
    expect(hoisted.batchSet.mock.calls[0][1]).not.toHaveProperty('prayerPage');
    expect(hoisted.batchUpdate).toHaveBeenCalledWith(
      { path: 'contacts/c1' },
      expect.objectContaining({ prayerListRemoved: hoisted.removed }),
    );
    expect(hoisted.batchCommit).toHaveBeenCalled();
  });

  it('writes nothing for an empty burden or a missing person', async () => {
    expect(await addPrayerBurden('c1', '   ', by, false)).toBeNull();
    expect(await addPrayerBurden('', 'Something', by, false)).toBeNull();
    expect(addDoc).not.toHaveBeenCalled();
    expect(hoisted.batchSet).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of pretending it worked', async () => {
    mock(addDoc).mockRejectedValueOnce(new Error('permission-denied'));
    expect(await addPrayerBurden('c1', 'Peace', by, false)).toBeNull();
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

describe('getContactCarers & getContactAddedBy', () => {
  const team = [
    { uid: 'u1', name: 'Mei Tanaka' },
    { uid: 'u2', name: 'Tony Wang' },
  ];

  it('names every carer holding the person in their sheep (#1051)', () => {
    expect(getContactCarers({ carers: ['u1', 'u2'] }, team)).toEqual(['Mei Tanaka', 'Tony Wang']);
  });

  it('names nobody when nobody has taken the person on', () => {
    expect(getContactCarers({}, team)).toEqual([]);
    expect(getContactCarers({ carers: [] }, team)).toEqual([]);
  });

  it('drops a carer whose name cannot be resolved', () => {
    expect(getContactCarers({ carers: ['u1', 'u-ghost'] }, team)).toEqual(['Mei Tanaka']);
  });

  it('resolves addedBy from createdByName first, then addedBy uid in team', () => {
    expect(getContactAddedBy({ createdByName: 'Tony Wang' }, team)).toBe('Tony Wang');
    expect(getContactAddedBy({ addedBy: 'u1' }, team)).toBe('Mei Tanaka');
    expect(getContactAddedBy({}, team)).toBeUndefined();
  });
});

describe('getContactGrade', () => {
  it('reads the year field, trimmed', () => {
    expect(getContactGrade({ year: 'Freshman' })).toBe('Freshman');
    expect(getContactGrade({ year: '  Junior ' })).toBe('Junior');
  });

  it('no longer reads year tags (#1348): grade comes from year only', () => {
    // A whole Contact is what callers pass; its tags are simply not read.
    const taggedOnly = { year: undefined, tags: ['Sophomore', 'Campus', '1st year'] };
    const both = { year: 'Freshman', tags: ['Senior'] };
    expect(getContactGrade(taggedOnly)).toBeUndefined();
    expect(getContactGrade(both)).toBe('Freshman');
  });

  it('returns undefined when no year is present', () => {
    expect(getContactGrade({ year: '   ' })).toBeUndefined();
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

describe('team prayer list removal (#1692)', () => {
  it('writes the team-wide removal on the contact, naming the caller', async () => {
    await removeFromTeamPrayerList('c1', by);
    expect(mock(updateDoc).mock.calls[0][0]).toEqual({ path: 'contacts/c1' });
    const patch = mock(updateDoc).mock.calls[0][1] as Record<string, any>;
    expect(patch.prayerListRemoved).toMatchObject({ by: 'u1', byName: 'Mei Tanaka' });
    expect(typeof patch.prayerListRemoved.at).toBe('string');
    expect(patch.updatedBy).toBe('u1');
    expect(patch.updatedByName).toBe('Mei Tanaka');
  });

  it('puts the person back by deleting the field, not by writing a boolean', async () => {
    await restoreToTeamPrayerList('c1', by);
    const patch = mock(updateDoc).mock.calls[0][1] as Record<string, any>;
    expect(patch.prayerListRemoved).toBe(hoisted.removed);
    expect(deleteField).toHaveBeenCalled();
    expect(patch.updatedBy).toBe('u1');
  });

  it('reports a failed removal instead of pretending it worked', async () => {
    mock(updateDoc).mockRejectedValueOnce(new Error('permission-denied'));
    await removeFromTeamPrayerList('c1', by);
    expect(handleFirestoreError).toHaveBeenCalled();
  });
});

describe('addTeamPrayer', () => {
  it('stamps prayerPage only when the caller is the prayer page', async () => {
    await addTeamPrayer('c1', 'Peace', by, { prayerPage: true });
    expect(hoisted.batchSet.mock.calls[0][1]).toMatchObject({ prayerPage: true });

    vi.clearAllMocks();
    hoisted.batchCommit.mockResolvedValue(undefined);
    await addTeamPrayer('c1', 'Peace', by);
    expect(hoisted.batchSet.mock.calls[0][1]).not.toHaveProperty('prayerPage');
  });

  it('leaves the contact alone when the batch fails', async () => {
    hoisted.batchCommit.mockRejectedValueOnce(new Error('permission-denied'));
    expect(await addTeamPrayer('c1', 'Peace', by)).toBeNull();
    expect(handleFirestoreError).toHaveBeenCalled();
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




describe('prayerCarrySummary (#1765)', () => {
  it('says "Needs marking" for an unmarked prayer — never "All answered"', () => {
    expect(prayerCarrySummary([{ status: 'pending' }])).toEqual({
      tone: 'pending',
      key: 'prayers.needs_marking',
    });
  });

  it('lets an unmarked prayer win over an answered sibling', () => {
    expect(prayerCarrySummary([{ status: 'answered' }, { status: 'pending' }]).key).toBe(
      'prayers.needs_marking',
    );
  });

  it('counts ongoing prayers when none are unmarked', () => {
    expect(prayerCarrySummary([{ status: 'answered' }, { status: 'ongoing' }, { status: 'ongoing' }])).toEqual({
      tone: 'accent',
      key: 'prayers.ongoing_count',
      count: 2,
    });
  });

  it('says "All answered" only when every prayer is answered', () => {
    expect(prayerCarrySummary([{ status: 'answered' }, { status: 'answered' }]).key).toBe('prayers.all_answered');
  });

  it('says "All archived" when every prayer is archived', () => {
    expect(prayerCarrySummary([{ status: 'unanswered' }])).toEqual({
      tone: 'muted',
      key: 'prayers.all_archived',
    });
  });

  it('says "No prayers yet" for a person with none', () => {
    expect(prayerCarrySummary([])).toEqual({ tone: 'muted', key: 'prayers.no_prayers_yet' });
  });
});

describe('placeholder prayer burdens (#1691, #1765)', () => {
  it('recognises both strings the app writes, whatever the author locale', () => {
    for (const text of PRAYER_PLACEHOLDER_BURDENS) {
      expect(isPlaceholderPrayerBurden(text)).toBe(true);
    }
  });

  it('does not mistake real prose for the placeholder', () => {
    expect(isPlaceholderPrayerBurden('Settling into the new term after the move.')).toBe(false);
    expect(isPlaceholderPrayerBurden('')).toBe(false);
    expect(isPlaceholderPrayerBurden(undefined)).toBe(false);
  });

  it('stays in step with both locale strings', () => {
    expect(PRAYER_PLACEHOLDER_BURDENS).toEqual([
      (en as any).prayers.holding_in_prayer,
      (es as any).prayers.holding_in_prayer,
    ]);
  });
});
