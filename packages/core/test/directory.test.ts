import { describe, it, expect } from 'vitest';
import { contactIdForEmail, contactKind, filterAndSortDirectory, isKindSorted, kindMatches, splitDirectory, stageToneKey } from '../src/directory';
import type { Touch } from '../src/myday';
import type { Contact, Stage } from '../src/types';

const NOW = new Date('2026-07-13T12:00:00Z').getTime();
const DAY_MS = 86_400_000;

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Alex',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: '',
  initials: 'A',
  ...overrides,
});

const touch = (overrides: Partial<Touch> = {}): Touch => ({
  contactId: 'c1',
  ms: NOW,
  note: '',
  ...overrides,
});

describe('filterAndSortDirectory', () => {
  it('matches search against name, major, and location', () => {
    const contacts = [
      contact({ id: 'a', name: 'Mei Lin', major: 'Biology', location: 'North Hall' }),
      contact({ id: 'b', name: 'Sam Cho', major: 'CS', location: 'South Hall' }),
    ];
    expect(filterAndSortDirectory(contacts, [], { search: 'mei', stageId: 'all' }, NOW).map((l) => l.contact.id)).toEqual(['a']);
    expect(filterAndSortDirectory(contacts, [], { search: 'biology', stageId: 'all' }, NOW).map((l) => l.contact.id)).toEqual(['a']);
    expect(filterAndSortDirectory(contacts, [], { search: 'south', stageId: 'all' }, NOW).map((l) => l.contact.id)).toEqual(['b']);
    expect(filterAndSortDirectory(contacts, [], { search: '', stageId: 'all' }, NOW)).toHaveLength(2);
  });

  it('also matches year, tags and notes (the v2 People search)', () => {
    const contacts = [
      contact({ id: 'a', name: 'Mei Lin', year: 'Sophomore' }),
      contact({ id: 'b', name: 'Sam Cho', tags: ['soccer', 'transfer'] }),
      contact({ id: 'c', name: 'Rio Diaz', notes: 'Met at the club fair' }),
    ];
    const ids = (search: string) =>
      filterAndSortDirectory(contacts, [], { search, stageId: 'all' }, NOW).map((l) => l.contact.id);
    expect(ids('sophomore')).toEqual(['a']);
    expect(ids('transfer')).toEqual(['b']);
    expect(ids('club fair')).toEqual(['c']);
  });

  it('filters by exact stage id, "all" bypasses the filter', () => {
    const contacts = [
      contact({ id: 'a', stage: 'new' }),
      contact({ id: 'b', stage: 'regular' }),
    ];
    expect(filterAndSortDirectory(contacts, [], { search: '', stageId: 'new' }, NOW).map((l) => l.contact.id)).toEqual(['a']);
    expect(filterAndSortDirectory(contacts, [], { search: '', stageId: 'all' }, NOW)).toHaveLength(2);
  });

  it('sorts longest-since-touched first', () => {
    const contacts = [
      contact({ id: 'recent' }),
      contact({ id: 'stale' }),
    ];
    const touches: Touch[] = [
      touch({ contactId: 'recent', ms: NOW - DAY_MS }),
      touch({ contactId: 'stale', ms: NOW - DAY_MS * 10 }),
    ];
    const result = filterAndSortDirectory(contacts, touches, { search: '', stageId: 'all' }, NOW);
    expect(result.map((l) => l.contact.id)).toEqual(['stale', 'recent']);
    expect(result[0].days).toBe(10);
    expect(result[1].days).toBe(1);
  });

  it('matches word-boundary, not mid-word substrings (#1192)', () => {
    const contacts = [
      contact({ id: 'named-ian', name: 'Ian Marks' }),
      contact({ id: 'christian-name', name: 'Christian Hall' }),
      contact({ id: 'christian-major', name: 'Bo Lin', major: 'Christian Studies' }),
    ];
    const ids = (search: string) =>
      filterAndSortDirectory(contacts, [], { search, stageId: 'all' }, NOW).map((l) => l.contact.id);
    expect(ids('ian')).toEqual(['named-ian']);
    expect(ids('christ')).toEqual(['christian-name', 'christian-major']);
  });

  it('ranks name matches above field-only matches (#1192)', () => {
    const contacts = [
      contact({ id: 'field-major', name: 'X Y', major: 'Ian Studies' }),
      contact({ id: 'name', name: 'Ian Z' }),
      contact({ id: 'field-notes', name: 'X W', notes: 'lives in Ian Hall' }),
    ];
    const result = filterAndSortDirectory(contacts, [], { search: 'ian', stageId: 'all' }, NOW);
    expect(result.map((l) => l.contact.id)).toEqual(['name', 'field-major', 'field-notes']);
  });

  it('falls back to createdAt when a contact has no touches', () => {
    const contacts = [contact({ id: 'a', createdAt: new Date(NOW - DAY_MS * 3).toISOString() })];
    const [entry] = filterAndSortDirectory(contacts, [], { search: '', stageId: 'all' }, NOW);
    expect(entry.days).toBe(3);
  });

  it('a contact with no touch and no createdAt has Infinity days and sorts first', () => {
    const contacts = [
      contact({ id: 'never', createdAt: undefined }),
      contact({ id: 'recent' }),
    ];
    const touches: Touch[] = [touch({ contactId: 'recent', ms: NOW - DAY_MS })];
    const result = filterAndSortDirectory(contacts, touches, { search: '', stageId: 'all' }, NOW);
    expect(result[0].contact.id).toBe('never');
    expect(result[0].days).toBe(Infinity);
  });
});

describe('splitDirectory', () => {
  const mineAndRest = (
    contacts: Contact[],
    personalIds: Set<string>,
    touches: Touch[] = [],
    search = '',
  ) => {
    const { mine, rest } = splitDirectory(contacts, touches, personalIds, search, NOW);
    return { mine: mine.map((l) => l.contact.id), rest: rest.map((l) => l.contact.id) };
  };

  it('splits on the personal-contacts set', () => {
    const contacts = [contact({ id: 'a' }), contact({ id: 'b' }), contact({ id: 'c' })];
    expect(mineAndRest(contacts, new Set(['a', 'c']))).toEqual({ mine: ['a', 'c'], rest: ['b'] });
  });

  it('an empty personal set puts everyone in "everyone else"', () => {
    const contacts = [contact({ id: 'a' }), contact({ id: 'b' })];
    expect(mineAndRest(contacts, new Set())).toEqual({ mine: [], rest: ['a', 'b'] });
  });

  it('sorts mine longest-since-talked first and the rest alphabetically', () => {
    const contacts = [
      contact({ id: 'recent', name: 'Zoe' }),
      contact({ id: 'stale', name: 'Ana' }),
      contact({ id: 'other-z', name: 'Zeke' }),
      contact({ id: 'other-a', name: 'Bo' }),
    ];
    const touches: Touch[] = [
      touch({ contactId: 'recent', ms: NOW - DAY_MS }),
      touch({ contactId: 'stale', ms: NOW - DAY_MS * 12 }),
    ];
    expect(mineAndRest(contacts, new Set(['recent', 'stale']), touches)).toEqual({
      mine: ['stale', 'recent'],
      rest: ['other-a', 'other-z'],
    });
  });

  it('applies the search to both groups', () => {
    const contacts = [
      contact({ id: 'a', name: 'Mei Lin' }),
      contact({ id: 'b', name: 'Sam Cho' }),
      contact({ id: 'c', name: 'Mei Chen' }),
    ];
    expect(mineAndRest(contacts, new Set(['a', 'b']), [], 'mei')).toEqual({ mine: ['a'], rest: ['c'] });
  });

  it('reports days the same way the flat list does', () => {
    const contacts = [contact({ id: 'a' })];
    const touches: Touch[] = [touch({ contactId: 'a', ms: NOW - DAY_MS * 4 })];
    const { mine } = splitDirectory(contacts, touches, new Set(['a']), '', NOW);
    expect(mine[0].days).toBe(4);
  });

  it('ranks name matches above field-only matches within each group (#1192)', () => {
    const contacts = [
      contact({ id: 'mine-name', name: 'Ian Mine' }),
      contact({ id: 'mine-field', name: 'Bo Mine', major: 'Ian Studies' }),
      contact({ id: 'rest-name', name: 'Ian Other' }),
      contact({ id: 'rest-field', name: 'Bo Other', notes: 'lives in Ian Hall' }),
    ];
    const { mine, rest } = splitDirectory(contacts, [], new Set(['mine-name', 'mine-field']), 'ian', NOW);
    expect(mine.map((l) => l.contact.id)).toEqual(['mine-name', 'mine-field']);
    expect(rest.map((l) => l.contact.id)).toEqual(['rest-name', 'rest-field']);
  });
});

describe('stageToneKey', () => {
  const stages: Stage[] = ['Met', 'Connected', 'Growing', 'Rooted', 'Sending'].map((label, i) => ({
    id: `s${i}`,
    label,
    color: '',
    order: i,
  }));

  it('gives each stage a stable tone, in the design’s order', () => {
    expect(stages.slice(0, 4).map((s) => stageToneKey(stages, s.label))).toEqual([
      'ask',
      'due',
      'note',
      'pray',
    ]);
  });

  it('wraps past the fourth stage', () => {
    expect(stageToneKey(stages, 'Sending')).toBe('ask');
  });

  it('falls back to "note" for an unknown or missing stage', () => {
    expect(stageToneKey(stages, 'Nowhere')).toBe('note');
    expect(stageToneKey(stages, undefined)).toBe('note');
    expect(stageToneKey([], 'Met')).toBe('note');
  });
});

describe('contactIdForEmail', () => {
  const roster = [
    contact({ id: 'c1', email: 'Ana@Example.com' }),
    contact({ id: 'c2', email: 'rio@example.com' }),
  ];

  it('matches an address case-insensitively, ignoring stray whitespace', () => {
    expect(contactIdForEmail(roster, 'ana@example.com')).toBe('c1');
    expect(contactIdForEmail(roster, '  RIO@EXAMPLE.COM ')).toBe('c2');
  });

  it('returns null when nobody on the roster uses that address', () => {
    expect(contactIdForEmail(roster, 'kofi@example.com')).toBeNull();
    expect(contactIdForEmail([], 'ana@example.com')).toBeNull();
  });

  it('returns null for a chat partner with no address to match on', () => {
    // Contacts default to an empty email, so a blank needle must not match them.
    expect(contactIdForEmail(roster, '')).toBeNull();
    expect(contactIdForEmail(roster, null)).toBeNull();
    expect(contactIdForEmail([contact({ id: 'c3' })], undefined)).toBeNull();
  });
});

// The kind of person (#1152, ADR 0030). Two booleans, three buckets, and a
// stamp that says a human decided rather than the default or the seed.
describe('contactKind — the four cells', () => {
  it('reads someone in the church life who is not a student as a local saint', () => {
    expect(contactKind(contact({ inChurchLife: true, isStudent: false }))).toBe('local-saint');
  });

  it('reads a student in the church life as our own', () => {
    expect(contactKind(contact({ inChurchLife: true, isStudent: true }))).toBe('our-own');
  });

  it('reads a student not in the church life as a contact', () => {
    expect(contactKind(contact({ inChurchLife: false, isStudent: true }))).toBe('contact');
  });

  it('reads a local not in the church life as a contact too — the fourth cell folds in', () => {
    expect(contactKind(contact({ inChurchLife: false, isStudent: false }))).toBe('contact');
  });

  it('reads a legacy document carrying neither field as a contact', () => {
    expect(contactKind(contact())).toBe('contact');
  });

  it('does not depend on the stage — two people alike but for their step match', () => {
    const atChurchMtg = contact({ inChurchLife: true, isStudent: true, stage: 'Church Mtg' });
    const atFirstContact = contact({ inChurchLife: true, isStudent: true, stage: 'First Contact' });
    expect(contactKind(atChurchMtg)).toBe(contactKind(atFirstContact));
  });
});

describe('isKindSorted — the stamp, not the value', () => {
  it('counts someone with no stamp as not sorted, whatever the fields say', () => {
    expect(isKindSorted(contact({ inChurchLife: false, isStudent: false }))).toBe(false);
  });

  it('counts someone a person decided about as sorted, including a plain contact', () => {
    expect(isKindSorted(contact({ inChurchLife: false, isStudent: false, kindSetBy: 'u1', kindSetAt: '2026-09-23' }))).toBe(true);
  });

  it('does not count a half-written stamp', () => {
    expect(isKindSorted(contact({ kindSetBy: 'u1' }))).toBe(false);
  });
});

describe('kindMatches — the Directory filter', () => {
  const saint = contact({ inChurchLife: true, isStudent: false, kindSetBy: 'u1', kindSetAt: '2026-09-23' });
  const ourOwn = contact({ inChurchLife: true, isStudent: true, kindSetBy: 'u1', kindSetAt: '2026-09-23' });
  const unsorted = contact();

  it('lets everyone through on "all"', () => {
    expect([saint, ourOwn, unsorted].filter((c) => kindMatches(c, 'all'))).toHaveLength(3);
  });

  it('narrows to one kind', () => {
    expect(kindMatches(saint, 'local-saint')).toBe(true);
    expect(kindMatches(ourOwn, 'local-saint')).toBe(false);
  });

  it('narrows to the people nobody has sorted yet', () => {
    expect(kindMatches(unsorted, 'unsorted')).toBe(true);
    expect(kindMatches(saint, 'unsorted')).toBe(false);
  });
});
