import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTagList,
  TAG_SUGGESTIONS,
  tagToneKey,
  tagStyle,
  getEffectiveContactTags,
  resolveStandardTags,
  STANDARD_TAG_SEED,
} from '../lib/tags';
import {
  tagToneKey as presentationToneKey,
  tagStyle as presentationStyle,
  ALL_TAG_TONES,
} from '../lib/tagPresentation';

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

  it('reads tab- and quote-spaced season labels without slow backtracking', () => {
    expect(normalizeTag("Fall\t'\t26")).toBe('Fall 2026');
    expect(normalizeTag("Fall'26")).toBe('Fall 2026');
    const hostile = `fall${'\t'.repeat(50_000)}x`;
    const started = Date.now();
    expect(normalizeTag(hostile)).toBe('fall x');
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('normalizes club rush variants', () => {
    expect(normalizeTag('club-rush')).toBe('Club Rush');
  });
});

describe('normalizeTagList', () => {
  it('drops case-insensitive repeats and canonicalizes season tags', () => {
    expect(normalizeTagList(["Fall '26", 'Fall 2026', '2026-27'])).toEqual([
      'Fall 2026',
      '2026-27',
    ]);
  });
});

describe('tagToneKey and tagStyle', () => {
  it('includes Saved, Baptized, Interested, and Open in TAG_SUGGESTIONS', () => {
    expect(TAG_SUGGESTIONS).toContain('Saved');
    expect(TAG_SUGGESTIONS).toContain('Baptized');
    expect(TAG_SUGGESTIONS).toContain('Interested');
    expect(TAG_SUGGESTIONS).toContain('Open');
  });

  it('returns sage for Saved and Baptized', () => {
    expect(tagToneKey('Saved')).toBe('sage');
    expect(tagToneKey('baptized')).toBe('sage');
  });

  it('returns teal for Interested and Open', () => {
    expect(tagToneKey('Interested')).toBe('teal');
    expect(tagToneKey('open')).toBe('teal');
  });

  it('returns appropriate tones for student years and special tags', () => {
    expect(tagToneKey('Freshman')).toBe('teal');
    expect(tagToneKey('Sophomore')).toBe('indigo');
    expect(tagToneKey('Junior')).toBe('plum');
    expect(tagToneKey('Senior')).toBe('ochre');
    expect(tagToneKey('new')).toBe('teal');
  });

  it('includes Club Rush and BFA in TAG_SUGGESTIONS', () => {
    expect(TAG_SUGGESTIONS).toContain('Club Rush');
    expect(TAG_SUGGESTIONS).toContain('BFA');
  });

  it('no longer suggests the year words as tags (#1348): year lives in `year`', () => {
    for (const year of ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate']) {
      expect(TAG_SUGGESTIONS).not.toContain(year);
    }
  });

  it('returns the clay outreach tone for Club Rush and BFA', () => {
    expect(tagToneKey('Club Rush')).toBe('clay');
    expect(tagToneKey('BFA')).toBe('clay');
  });

  it('returns a CSS variable style with tone variables', () => {
    const style = tagStyle('Saved');
    expect(style).toEqual({
      '--tone': 'var(--t-sage)',
      '--tone-soft': 'var(--t-sage-soft)',
    });
  });

  it('tagPresentation exports match tagStyle and tagToneKey directly', () => {
    expect(presentationToneKey('Saved')).toBe('sage');
    expect(presentationStyle('Saved')).toEqual({
      '--tone': 'var(--t-sage)',
      '--tone-soft': 'var(--t-sage-soft)',
    });
    expect(ALL_TAG_TONES).toContain('teal');
    expect(ALL_TAG_TONES).toContain('sage');
  });
});

describe('standard tags (ADR 0039)', () => {
  it('seeds the six former constants', () => {
    expect(STANDARD_TAG_SEED).toEqual(TAG_SUGGESTIONS);
  });

  it('falls back to the seed when the document has not loaded', () => {
    expect(resolveStandardTags(undefined)).toEqual(STANDARD_TAG_SEED);
    expect(resolveStandardTags(null)).toEqual(STANDARD_TAG_SEED);
  });

  it('keeps a loaded list (empty stays empty) and normalizes it', () => {
    expect(resolveStandardTags([])).toEqual([]);
    expect(resolveStandardTags(['Welcome', 'welcome'])).toEqual(['Welcome']);
  });
});

describe('getEffectiveContactTags', () => {
  it('injects new tag when contact was created within 5 days', () => {
    const recently = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Freshman'], recently)).toEqual(['new', 'Freshman']);
  });

  it('injects new tag when contact was created exactly 5 days ago', () => {
    const boundary = new Date(Date.now() - 5 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Freshman'], boundary)).toEqual(['new', 'Freshman']);
  });

  it('does not duplicate new tag if already present', () => {
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['New', 'Senior'], recently)).toEqual(['New', 'Senior']);
  });

  it('does not inject new tag when contact was created more than 5 days ago', () => {
    const older = new Date(Date.now() - 6 * 86_400_000).toISOString();
    expect(getEffectiveContactTags(['Freshman'], older)).toEqual(['Freshman']);
  });
});
