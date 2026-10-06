import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTagList,
  planTagCombining,
  getEffectiveContactTags,
  TAG_SUGGESTIONS,
  clusterTags,
  planTagCombiningWithRules,
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
