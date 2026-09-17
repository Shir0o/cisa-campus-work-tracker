import { describe, it, expect } from 'vitest';
import {
  findCandidateDuplicates,
  combineContactProfiles,
} from '../lib/contactCombining';
import type { Contact } from '../types';

describe('findCandidateDuplicates', () => {
  it('detects duplicates by normalized email', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'John Doe', email: 'john@example.com', createdAt: '2026-01-01' },
      { id: '2', name: 'Johnny D', email: '  JOHN@EXAMPLE.COM ', createdAt: '2026-01-02' },
      { id: '3', name: 'Jane Smith', email: 'jane@example.com', createdAt: '2026-01-03' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].survivor.id).toBe('1');
    expect(pairs[0].duplicate.id).toBe('2');
    expect(pairs[0].reason).toContain('email');
  });

  it('detects duplicates by normalized phone', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'Mary', phone: '(555) 123-4567', createdAt: '2026-01-01' },
      { id: '2', name: 'Mary M', phone: '5551234567', createdAt: '2026-01-02' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].survivor.id).toBe('1');
    expect(pairs[0].duplicate.id).toBe('2');
    expect(pairs[0].reason).toContain('phone');
  });

  it('detects duplicates by exact or word-boundary full name match', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'David Lee', email: '', phone: '', createdAt: '2026-01-01' },
      { id: '2', name: 'david lee', email: '', phone: '', createdAt: '2026-01-02' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].survivor.id).toBe('1');
    expect(pairs[0].duplicate.id).toBe('2');
    expect(pairs[0].reason).toContain('name');
  });

  it('defaults the older contact as survivor', () => {
    const contacts: Partial<Contact>[] = [
      { id: 'newer', name: 'Alice', email: 'alice@test.com', createdAt: '2026-02-01' },
      { id: 'older', name: 'Alice', email: 'alice@test.com', createdAt: '2026-01-01' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs[0].survivor.id).toBe('older');
    expect(pairs[0].duplicate.id).toBe('newer');
  });
});

describe('combineContactProfiles', () => {
  it('unions relationship sets and preserves survivor scalar details while backfilling missing', () => {
    const survivor: Partial<Contact> = {
      id: 'c1',
      name: 'Bob Original',
      email: 'bob@test.com',
      phone: '1234567890',
      notes: 'First note',
      tags: ['Fall 2026'],
      founders: ['u1'],
      carers: ['u1'],
      coCreators: ['u2'],
      visibleTo: ['u1', 'u2'],
      major: 'Computer Science',
    };

    const duplicate: Partial<Contact> = {
      id: 'c2',
      name: 'Bob Newer',
      email: 'bob@test.com',
      phone: '1234567890',
      notes: 'Second note from signup',
      tags: ['Saved', 'Fall 2026'],
      founders: ['u3'],
      carers: ['u4'],
      coCreators: ['u3'],
      visibleTo: ['u3', 'u4'],
      year: 'Junior',
      spiritualBackground: 'Christian',
    };

    const merged = combineContactProfiles(survivor as Contact, duplicate as Contact);

    expect(merged.name).toBe('Bob Original');
    expect(merged.major).toBe('Computer Science');
    expect(merged.year).toBe('Junior');
    expect(merged.spiritualBackground).toBe('Christian');
    expect(merged.notes).toContain('First note');
    expect(merged.notes).toContain('Second note from signup');
    expect(merged.tags).toEqual(['Fall 2026', 'Saved']);
    expect(merged.founders).toEqual(['u1', 'u3']);
    expect(merged.carers).toEqual(['u1', 'u4']);
    expect(merged.coCreators).toEqual(['u2', 'u3']);
    expect(merged.visibleTo).toEqual(['u1', 'u2', 'u3', 'u4']);
  });
});
