import { describe, it, expect } from 'vitest';
import { normalizeTag, normalizeTagList, planTagCombining, getEffectiveContactTags } from '../src/tags';

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

describe('getEffectiveContactTags', () => {
  it('injects new tag for contacts created within 7 days', () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Lead'], recent)).toEqual(['new', 'Lead']);
  });

  it('does not duplicate existing new tag', () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['new', 'Lead'], recent)).toEqual(['new', 'Lead']);
  });

  it('does not inject new tag for contacts older than 7 days', () => {
    const older = new Date(Date.now() - 14 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Lead'], older)).toEqual(['Lead']);
  });
});
