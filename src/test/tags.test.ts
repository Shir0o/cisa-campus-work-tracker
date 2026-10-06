import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTagList,
  planTagCombining,
  TAG_SUGGESTIONS,
  tagToneKey,
  tagStyle,
  getEffectiveContactTags,
  clusterTags,
  planTagCombiningWithRules,
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

  it('clusters context-suffixed tags like BFA table and Club rush table into anchors', () => {
    const contacts = [
      { id: '1', name: 'Student 1', tags: ['BFA table'] },
      { id: '2', name: 'Student 2', tags: ['bfa-table'] },
      { id: '3', name: 'Student 3', tags: ['Club rush table'] },
    ];

    expect(planTagCombining(contacts)).toEqual([
      { contactId: '1', name: 'Student 1', from: ['BFA table'], to: ['BFA'] },
      { contactId: '2', name: 'Student 2', from: ['bfa-table'], to: ['BFA'] },
      { contactId: '3', name: 'Student 3', from: ['Club rush table'], to: ['Club Rush'] },
    ]);
  });
});

describe('clusterTags', () => {
  it('detects BFA table variants and maps them to anchor BFA', () => {
    const contacts = [
      { id: '1', name: 'S1', tags: ['BFA table', 'Freshman'] },
      { id: '2', name: 'S2', tags: ['bfa-table'] },
      { id: '3', name: 'S3', tags: ['BFA'] },
    ];

    const rules = clusterTags(contacts);
    const bfaRule = rules.find((r) => r.to === 'BFA');
    expect(bfaRule).toBeDefined();
    expect(bfaRule?.from.sort()).toEqual(['BFA table', 'bfa-table'].sort());
    expect(bfaRule?.contactCount).toBe(2);
  });

  it('resolves near-duplicate non-anchor clusters by directory frequency', () => {
    const contacts = [
      { id: '1', name: 'S1', tags: ['Bible Study'] },
      { id: '2', name: 'S2', tags: ['Bible Study'] },
      { id: '3', name: 'S3', tags: ['bible study'] },
      { id: '4', name: 'S4', tags: ['bible-study'] },
    ];

    const rules = clusterTags(contacts);
    const rule = rules.find((r) => r.to === 'Bible Study');
    expect(rule).toBeDefined();
    expect(rule?.from.sort()).toEqual(['bible study', 'bible-study'].sort());
    expect(rule?.contactCount).toBe(2);
  });

  it('detects small typos against suggestion anchors (<= 1 edit distance)', () => {
    const contacts = [
      { id: '1', name: 'S1', tags: ['intersted'] },
      { id: '2', name: 'S2', tags: ['baptise'] },
    ];

    const rules = clusterTags(contacts);
    expect(rules.find((r) => r.to === 'Interested')?.from).toContain('intersted');
    expect(rules.find((r) => r.to === 'Baptized')?.from).toContain('baptise');
  });
});

describe('planTagCombiningWithRules', () => {
  it('honors enabled rule IDs and skips disabled rules', () => {
    const contacts = [
      { id: '1', name: 'S1', tags: ['BFA table'] },
      { id: '2', name: 'S2', tags: ['intersted'] },
    ];

    const rules = clusterTags(contacts);
    const bfaRule = rules.find((r) => r.to === 'BFA')!;
    const enabledIds = new Set([bfaRule.id]);

    const plan = planTagCombiningWithRules(contacts, rules, enabledIds);
    expect(plan).toEqual([
      { contactId: '1', name: 'S1', from: ['BFA table'], to: ['BFA'] },
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

