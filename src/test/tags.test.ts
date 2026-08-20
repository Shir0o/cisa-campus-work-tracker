import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTagList,
  planTagCombining,
  TAG_SUGGESTIONS,
  tagToneKey,
  tagStyle,
} from '../lib/tags';

describe('normalizeTag', () => {
  it('turns short season labels into full year labels', () => {
    expect(normalizeTag("Fall '26")).toBe('Fall 2026');
    expect(normalizeTag('Spring 27')).toBe('Spring 2027');
  });

  it('adds spaces to compact season tags like Fall2025', () => {
    expect(normalizeTag('Fall2025')).toBe('Fall 2025');
    expect(normalizeTag('Spring26')).toBe('Spring 2026');
    expect(normalizeTag('fall 2027')).toBe('Fall 2027');
  });

  it('normalizes club rush variants', () => {
    expect(normalizeTag('club-rush')).toBe('Club Rush');
  });
});

describe('normalizeTagList', () => {
  it('dedupes case-insensitively and canonicalizes season tags', () => {
    expect(normalizeTagList(["Fall '26", 'Fall 2026', '2026-27'])).toEqual([
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

  it('plans compact season spellings as canonical spaced tags', () => {
    const contacts = [
      { id: 'a', name: 'A', tags: ['Fall2025'] },
    ];

    expect(planTagCombining(contacts)).toEqual([
      {
        contactId: 'a',
        name: 'A',
        from: ['Fall2025'],
        to: ['Fall 2025'],
      },
    ]);
  });
});

describe('tagToneKey and tagStyle', () => {
  it('includes Saved in TAG_SUGGESTIONS', () => {
    expect(TAG_SUGGESTIONS).toContain('Saved');
    expect(TAG_SUGGESTIONS).toContain('Baptized');
  });

  it('returns sage for Saved and Baptized', () => {
    expect(tagToneKey('Saved')).toBe('sage');
    expect(tagToneKey('baptized')).toBe('sage');
  });

  it('returns appropriate tones for student years', () => {
    expect(tagToneKey('Freshman')).toBe('teal');
    expect(tagToneKey('Sophomore')).toBe('indigo');
    expect(tagToneKey('Junior')).toBe('plum');
    expect(tagToneKey('Senior')).toBe('ochre');
  });

  it('returns a CSS variable style with tone variables', () => {
    const style = tagStyle('Saved');
    expect(style).toEqual({
      '--tone': 'var(--t-sage)',
      '--tone-soft': 'var(--t-sage-soft)',
    });
  });
});

