import { describe, it, expect } from 'vitest';
import * as search from '../src/search';
import { recentPeople, searchPeople } from '../src/search';
import type { Contact } from '../src/types';

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Zed Zephyr',
  location: '',
  email: '',
  phone: '',
  stage: 'New',
  lastSeen: '2026-01-01T00:00:00.000Z',
  initials: 'ZZ',
  ...overrides,
});

describe('people only (cut-or-keep §27)', () => {
  it('exposes no history or quick-action results — a search only finds people', () => {
    expect(Object.keys(search).sort()).toEqual(['GS_MAX', 'recentPeople', 'searchPeople']);
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

  it('does not match on a stored role (#1345)', () => {
    const legacy = { ...contact({ id: 'legacy', name: 'X' }), role: 'Faculty' } as Contact;
    expect(searchPeople([legacy], 'faculty')).toEqual([]);
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

  it('matches across name/location/notes/spiritualBackground/tags', () => {
    const contacts = [
      contact({ id: 'by-name', name: 'Ada Lovelace' }),
      contact({ id: 'by-location', name: 'X', location: 'Miller Hall' }),
      contact({ id: 'by-notes', name: 'X', notes: 'met at the coffee shop' }),
      contact({ id: 'by-background', name: 'X', spiritualBackground: 'Catholic' }),
      contact({ id: 'by-tag', name: 'X', tags: ['Fall2026'] }),
      contact({ id: 'no-match', name: 'Y' }),
    ];
    expect(searchPeople(contacts, 'ada').map((c) => c.id)).toEqual(['by-name']);
    expect(searchPeople(contacts, 'miller').map((c) => c.id)).toEqual(['by-location']);
    expect(searchPeople(contacts, 'coffee').map((c) => c.id)).toEqual(['by-notes']);
    expect(searchPeople(contacts, 'catholic').map((c) => c.id)).toEqual(['by-background']);
    expect(searchPeople(contacts, 'fall2026').map((c) => c.id)).toEqual(['by-tag']);
  });

  it('caps at the given max', () => {
    const contacts = [contact({ id: 'a', name: 'Match A' }), contact({ id: 'b', name: 'Match B' })];
    expect(searchPeople(contacts, 'match', 1)).toHaveLength(1);
  });

  it('matches word-boundary, not mid-word substrings (#1192)', () => {
    const contacts = [
      contact({ id: 'named-ian', name: 'Ian Marks' }),
      contact({ id: 'christian-background', name: 'Bo', spiritualBackground: 'Christian' }),
    ];
    expect(searchPeople(contacts, 'ian').map((c) => c.id)).toEqual(['named-ian']);
    expect(searchPeople(contacts, 'christ').map((c) => c.id)).toEqual(['christian-background']);
  });

  it('ranks name matches above field-only matches (#1192)', () => {
    const contacts = [
      contact({ id: 'by-notes', name: 'Zed', notes: 'Ian Studies' }),
      contact({ id: 'by-name', name: 'Ian Zephyr' }),
    ];
    expect(searchPeople(contacts, 'ian').map((c) => c.id)).toEqual(['by-name', 'by-notes']);
  });

  it('fills the cap with name matches before field-only matches (#1192)', () => {
    const contacts = [
      contact({ id: 'name-1', name: 'Ian A' }),
      contact({ id: 'name-2', name: 'Ian B' }),
      contact({ id: 'field-1', name: 'X', notes: 'Ian Studies' }),
    ];
    expect(searchPeople(contacts, 'ian', 2).map((c) => c.id)).toEqual(['name-1', 'name-2']);
  });
});
