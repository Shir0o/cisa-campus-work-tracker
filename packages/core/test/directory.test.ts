import { describe, it, expect } from 'vitest';
import { filterAndSortDirectory } from '../src/directory';
import type { Touch } from '../src/myday';
import type { Contact } from '../src/types';

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
