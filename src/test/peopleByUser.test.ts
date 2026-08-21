import { describe, it, expect } from 'vitest';
import { groupContactsByCreator } from '../lib/peopleByUser';
import type { Contact } from '../types';

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
