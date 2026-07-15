import { describe, it, expect } from 'vitest';
import { quickActionsFor, recentPeople, searchHistory, searchPeople, snippet } from '../src/search';
import type { Contact } from '../src/types';
import type { Hist } from '../src/history';

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Zed Zephyr',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: 'New',
  lastSeen: '2026-01-01T00:00:00.000Z',
  initials: 'ZZ',
  ...overrides,
});

const hist = (overrides: Partial<Hist> = {}): Hist => ({
  id: 'h1',
  user: 'Grace Hopper',
  action: 'created a new contact',
  target: 'Ada Lovelace',
  type: 'create',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('snippet', () => {
  it('collapses whitespace and trims', () => {
    expect(snippet('  hello   world  ')).toBe('hello world');
  });

  it('truncates with an ellipsis past the max length', () => {
    const long = 'a'.repeat(80);
    const s = snippet(long, 10);
    expect(s.length).toBe(11); // 10 chars + ellipsis
    expect(s.endsWith('…')).toBe(true);
  });
});

describe('recentPeople', () => {
  it('sorts by updatedAt||createdAt||lastSeen, newest first', () => {
    const contacts = [
      contact({ id: 'old', lastSeen: '2025-01-01T00:00:00.000Z' }),
      contact({ id: 'new', updatedAt: '2026-06-01T00:00:00.000Z' }),
      contact({ id: 'mid', createdAt: '2026-01-15T00:00:00.000Z' }),
    ];
    expect(recentPeople(contacts).map((c) => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('caps at the given max', () => {
    const contacts = [contact({ id: 'a' }), contact({ id: 'b' }), contact({ id: 'c' })];
    expect(recentPeople(contacts, 2)).toHaveLength(2);
  });
});

describe('searchPeople', () => {
  it('returns nothing for an empty query', () => {
    expect(searchPeople([contact()], '')).toEqual([]);
  });

  it('matches across name/role/location/notes/spiritualBackground/tags', () => {
    const contacts = [
      contact({ id: 'by-name', name: 'Ada Lovelace' }),
      contact({ id: 'by-role', name: 'X', role: 'Faculty' }),
      contact({ id: 'by-location', name: 'X', location: 'Miller Hall' }),
      contact({ id: 'by-notes', name: 'X', notes: 'met at the coffee shop' }),
      contact({ id: 'by-background', name: 'X', spiritualBackground: 'Catholic' }),
      contact({ id: 'by-tag', name: 'X', tags: ['Fall2026'] }),
      contact({ id: 'no-match', name: 'Y', role: 'Z' }),
    ];
    expect(searchPeople(contacts, 'ada').map((c) => c.id)).toEqual(['by-name']);
    expect(searchPeople(contacts, 'faculty').map((c) => c.id)).toEqual(['by-role']);
    expect(searchPeople(contacts, 'miller').map((c) => c.id)).toEqual(['by-location']);
    expect(searchPeople(contacts, 'coffee').map((c) => c.id)).toEqual(['by-notes']);
    expect(searchPeople(contacts, 'catholic').map((c) => c.id)).toEqual(['by-background']);
    expect(searchPeople(contacts, 'fall2026').map((c) => c.id)).toEqual(['by-tag']);
  });

  it('caps at the given max', () => {
    const contacts = [contact({ id: 'a', name: 'Match A' }), contact({ id: 'b', name: 'Match B' })];
    expect(searchPeople(contacts, 'match', 1)).toHaveLength(1);
  });
});

describe('searchHistory', () => {
  it('returns nothing for an empty query', () => {
    expect(searchHistory([hist()], '', 'manager')).toEqual([]);
  });

  it('returns nothing for a role below manager, regardless of match', () => {
    expect(searchHistory([hist({ action: 'created a new contact' })], 'created', 'operator')).toEqual([]);
    expect(searchHistory([hist({ action: 'created a new contact' })], 'created', 'viewer')).toEqual([]);
  });

  it('matches across action/description/target for manager+', () => {
    const activities = [
      hist({ id: 'by-action', action: 'logged an interaction for' }),
      hist({ id: 'by-description', action: 'x', description: 'called about club rush' }),
      hist({ id: 'by-target', action: 'x', target: 'Grace Hopper' }),
      hist({ id: 'no-match', action: 'y', target: 'z' }),
    ];
    expect(searchHistory(activities, 'interaction', 'manager').map((a) => a.id)).toEqual(['by-action']);
    expect(searchHistory(activities, 'club rush', 'admin').map((a) => a.id)).toEqual(['by-description']);
    expect(searchHistory(activities, 'grace', 'manager').map((a) => a.id)).toEqual(['by-target']);
  });
});

describe('quickActionsFor', () => {
  it('hides "New contact" for a viewer', () => {
    const keys = quickActionsFor('viewer').map((a) => a.key);
    expect(keys).not.toContain('new-contact');
    expect(keys).toContain('signup');
  });

  it('shows "New contact" for operator and above', () => {
    expect(quickActionsFor('operator').map((a) => a.key)).toContain('new-contact');
    expect(quickActionsFor('admin').map((a) => a.key)).toContain('new-contact');
  });

  it('always shows "Open sign-up form", even for a null role', () => {
    expect(quickActionsFor(null).map((a) => a.key)).toEqual(['signup']);
  });
});
