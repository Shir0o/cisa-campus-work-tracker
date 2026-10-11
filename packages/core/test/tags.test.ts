import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTagList,
  getEffectiveContactTags,
  TAG_SUGGESTIONS,
  isSeasonTag,
  resolveStandardTags,
  standardTagsForGuessing,
  STANDARD_TAG_SEED,
} from '../src/tags';

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
  it('drops case-insensitive repeats and canonicalizes season tags', () => {
    expect(normalizeTagList(["Fall '26", 'Fall 2026', '2026-27', 'fall 2026'])).toEqual([
      'Fall 2026',
      '2026-27',
    ]);
  });
});

describe('getEffectiveContactTags', () => {
  it('injects new tag for contacts created within 5 days', () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Lead'], recent)).toEqual(['new', 'Lead']);
  });

  it('injects new tag for contacts created exactly 5 days ago', () => {
    const boundary = new Date(Date.now() - 5 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Lead'], boundary)).toEqual(['new', 'Lead']);
  });

  it('does not duplicate existing new tag', () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['new', 'Lead'], recent)).toEqual(['new', 'Lead']);
  });

  it('does not inject new tag for contacts older than 5 days', () => {
    const older = new Date(Date.now() - 6 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Lead'], older)).toEqual(['Lead']);
  });
});

describe('TAG_SUGGESTIONS', () => {
  it('includes Saved, Baptized, Interested, and Open', () => {
    expect(TAG_SUGGESTIONS).toContain('Saved');
    expect(TAG_SUGGESTIONS).toContain('Baptized');
    expect(TAG_SUGGESTIONS).toContain('Interested');
    expect(TAG_SUGGESTIONS).toContain('Open');
  });

  it('includes Club Rush and BFA', () => {
    expect(TAG_SUGGESTIONS).toContain('Club Rush');
    expect(TAG_SUGGESTIONS).toContain('BFA');
  });

  it('no longer suggests the year words as tags (#1348): year lives in `year`', () => {
    for (const year of ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate']) {
      expect(TAG_SUGGESTIONS).not.toContain(year);
    }
  });
});

describe('standard tags (ADR 0039)', () => {
  it('seeds the six former constants', () => {
    expect(STANDARD_TAG_SEED).toEqual(TAG_SUGGESTIONS);
  });

  it('recognizes season tags, and only season tags', () => {
    expect(isSeasonTag('Fall 2026')).toBe(true);
    expect(isSeasonTag("Fall '26")).toBe(true);
    expect(isSeasonTag('BFA')).toBe(false);
  });

  it('falls back to the seed when the document has not loaded; keeps a loaded list', () => {
    expect(resolveStandardTags(undefined)).toEqual(STANDARD_TAG_SEED);
    expect(resolveStandardTags(null)).toEqual(STANDARD_TAG_SEED);
    expect(resolveStandardTags([])).toEqual([]);
    expect(resolveStandardTags(['Welcome', 'welcome'])).toEqual(['Welcome']);
  });

  it('treats season tags as standard for guessing without storing them', () => {
    const tags = standardTagsForGuessing(['Welcome'], [{ tags: ['Fall 2025', "Fall '26"] }]);
    expect(tags).toContain('Welcome');
    expect(tags).toContain('Fall 2025');
    expect(tags).toContain('Fall 2026');
  });
});
