import { describe, it, expect } from 'vitest';
import { normalizeTag, normalizeTagList, planTagCombining } from '../src/tags';

describe('normalizeTag', () => {
  it('turns short season labels into full year labels', () => {
    expect(normalizeTag("Fall '26")).toBe('Fall 2026');
    expect(normalizeTag("Fall'26")).toBe('Fall 2026');
    expect(normalizeTag("fall ’26")).toBe('Fall 2026');
    expect(normalizeTag('Spring 27')).toBe('Spring 2027');
  });

  it('normalizes club rush variants', () => {
    expect(normalizeTag('club-rush')).toBe('Club Rush');
    expect(normalizeTag('club rush')).toBe('Club Rush');
  });
});

describe('normalizeTagList', () => {
  it('dedupes case-insensitively and canonicalizes season tags', () => {
    expect(normalizeTagList(["Fall '26", 'Fall 2026', '2026-27', 'fall 2026'])).toEqual([
      'Fall 2026',
      '2026-27',
    ]);
  });
});

describe('planTagCombining', () => {
  it('only plans rows that would actually change', () => {
    const contacts = [
      { id: 'a', name: 'A', tags: ["Fall '26", 'Fall 2026'] },
      { id: 'b', name: 'B', tags: ['Fall 2026'] },
      { id: 'c', name: 'C', tags: [] },
    ];

    expect(planTagCombining(contacts)).toEqual([
      {
        contactId: 'a',
        name: 'A',
        from: ["Fall '26", 'Fall 2026'],
        to: ['Fall 2026'],
      },
    ]);
  });
});
