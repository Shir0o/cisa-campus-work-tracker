import { describe, it, expect } from 'vitest';
import { findDuplicateContact } from '../lib/duplicateContact';
import type { Contact } from '../types';

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

describe('findDuplicateContact — the web add form reuses the combine matcher', () => {
  const roster = [
    person({ id: 'a', name: 'Alice Smith', email: 'alice@campus.edu', phone: '(555) 111-2222' }),
    person({ id: 'b', name: 'Bob Jones', email: 'bob@campus.edu', phone: '(555) 333-4444' }),
  ];

  it('matches a normalized name, email, or phone', () => {
    expect(findDuplicateContact({ name: '  ALICE SMITH ' }, roster)?.contact.id).toBe('a');
    expect(findDuplicateContact({ email: ' ALICE@Campus.EDU ' }, roster)?.contact.id).toBe('a');
    expect(findDuplicateContact({ phone: '5551112222' }, roster)?.contact.id).toBe('a');
  });

  it('reports which field matched', () => {
    expect(findDuplicateContact({ email: 'bob@campus.edu' }, roster)?.matchedOn).toBe('email');
    expect(findDuplicateContact({ phone: '5553334444' }, roster)?.matchedOn).toBe('phone');
    expect(findDuplicateContact({ name: 'Bob Jones' }, roster)?.matchedOn).toBe('name');
  });

  it('prefers an email match over a name match elsewhere', () => {
    const result = findDuplicateContact({ name: 'Bob Jones', email: 'alice@campus.edu' }, roster);
    expect(result?.contact.id).toBe('a');
    expect(result?.matchedOn).toBe('email');
  });

  it('returns null when nothing matches', () => {
    expect(findDuplicateContact({ name: 'Carol Diaz', email: 'carol@campus.edu' }, roster)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(findDuplicateContact({}, roster)).toBeNull();
  });
});
