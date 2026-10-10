import { describe, it, expect } from 'vitest';
import { findDuplicateContact, type DuplicateMatchable } from '../src/duplicateContact';
import type { Contact } from '../src/types';

const person = (overrides: Partial<Contact> & Pick<Contact, 'id'>): Contact => ({
  name: '',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: '',
  initials: '',
  ...overrides,
});

const entered = (fields: Partial<DuplicateMatchable>): DuplicateMatchable => ({
  name: '',
  email: '',
  phone: '',
  ...fields,
});

describe('findDuplicateContact — warn before adding a person who may exist', () => {
  const roster = [
    person({ id: 'a', name: 'Alice Smith', email: 'alice@campus.edu', phone: '(555) 111-2222' }),
    person({ id: 'b', name: 'Bob Jones', email: 'bob@campus.edu', phone: '(555) 333-4444' }),
  ];

  it('matches on normalized name (case and surrounding-whitespace insensitive)', () => {
    expect(findDuplicateContact(entered({ name: '  ALICE SMITH ' }), roster)?.contact.id).toBe('a');
  });

  it('matches on normalized email', () => {
    expect(findDuplicateContact(entered({ email: ' ALICE@Campus.EDU ' }), roster)?.contact.id).toBe('a');
  });

  it('matches on normalized phone (digits only)', () => {
    expect(findDuplicateContact(entered({ phone: '5551112222' }), roster)?.contact.id).toBe('a');
  });

  it('reports which field matched', () => {
    expect(findDuplicateContact(entered({ email: 'bob@campus.edu' }), roster)?.matchedOn).toBe('email');
    expect(findDuplicateContact(entered({ phone: '5553334444' }), roster)?.matchedOn).toBe('phone');
    expect(findDuplicateContact(entered({ name: 'Bob Jones' }), roster)?.matchedOn).toBe('name');
  });

  it('prefers an email match over a name match elsewhere', () => {
    const result = findDuplicateContact(entered({ name: 'Bob Jones', email: 'alice@campus.edu' }), roster);
    expect(result?.contact.id).toBe('a');
    expect(result?.matchedOn).toBe('email');
  });

  it('returns null when nothing matches', () => {
    expect(findDuplicateContact(entered({ name: 'Carol Diaz', email: 'carol@campus.edu' }), roster)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(findDuplicateContact(entered({}), roster)).toBeNull();
  });

  it('does not match on a substring of a name', () => {
    expect(findDuplicateContact(entered({ name: 'Alice' }), roster)).toBeNull();
  });
});
