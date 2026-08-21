import { describe, it, expect } from 'vitest';
import { contactIdForEmail, filterAndSortDirectory, groupContactsByCreator, splitDirectory, stageToneKey } from '../src/directory';
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


describe('groupContactsByCreator', () => {
  it('groups contacts by the person who added them and sorts groups by name', () => {
    const contacts = [
      contact({ id: 'a', name: 'Amy', createdBy: 'u1', createdByName: 'Mei Tanaka' }),
      contact({ id: 'b', name: 'Bo', createdBy: 'u2', createdByName: 'Ana Beltrán' }),
      contact({ id: 'c', name: 'Cy', createdBy: 'u1', createdByName: 'Mei Tanaka' }),
      contact({ id: 'd', name: 'Dee', createdBy: undefined, createdByName: undefined }),
    ];
    const groups = groupContactsByCreator(contacts);
    expect(groups.map((g) => g.name)).toEqual(['Ana Beltrán', 'Mei Tanaka', 'Unassigned']);
    expect(groups.find((g) => g.name === 'Mei Tanaka')?.contacts.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('falls back to uid when a display name is missing', () => {
    const groups = groupContactsByCreator([contact({ id: 'a', createdBy: 'u9' })]);
    expect(groups[0].name).toBe('u9');
  });

  it('returns an empty array for no contacts', () => {
    expect(groupContactsByCreator([])).toEqual([]);
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
