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
  guessTagCombines,
  planTagApplies,
  isSeasonTag,
  resolveStandardTags,
  standardTagsForGuessing,
  STANDARD_TAG_SEED,
} from '../lib/tags';

const guessFor = (
  guesses: ReturnType<typeof guessTagCombines>,
  target: string,
  tier: 'strong' | 'weak',
) => guesses.find((g) => g.target === target && g.tier === tier);

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

describe('guessTagCombines — tiers', () => {
  it('marks case, punctuation or spacing variants as strong', () => {
    const guesses = guessTagCombines([
      { tags: ['club rush'] },
      { tags: ['Club Rush'] },
      { tags: ['club-rush'] },
    ]);
    const guess = guessFor(guesses, 'Club Rush', 'strong')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('case-punctuation');
    expect(guess.variants.sort()).toEqual(['club rush', 'club-rush'].sort());
  });

  it('marks a standard tag plus a context word as strong', () => {
    const guesses = guessTagCombines([{ tags: ['BFA table'] }, { tags: ['bfa-table'] }]);
    const guess = guessFor(guesses, 'BFA', 'strong')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('standard-context');
    expect(guess.variants.sort()).toEqual(['BFA table', 'bfa-table'].sort());
  });

  it('marks a standard tag plus a non-context word as weak', () => {
    const guesses = guessTagCombines([{ tags: ['BFA leaders'] }, { tags: ['BFA'] }]);
    const guess = guessFor(guesses, 'BFA', 'weak')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('standard-extra');
    expect(guess.variants).toEqual(['BFA leaders']);
  });

  it('marks another tag plus extra words as weak (Prayer walk table → Prayer walk)', () => {
    const guesses = guessTagCombines([{ tags: ['Prayer walk table'] }, { tags: ['Prayer walk'] }]);
    const guess = guessFor(guesses, 'Prayer walk', 'weak')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('extra-words');
    expect(guess.variants).toEqual(['Prayer walk table']);
  });

  it('marks one-letter typos as weak (intersted → Interested)', () => {
    const guesses = guessTagCombines([{ tags: ['intersted'] }]);
    const guess = guessFor(guesses, 'Interested', 'weak')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('typo');
    expect(guess.variants).toEqual(['intersted']);
  });

  it('prefers frequency, then clean Title Case, when choosing a non-standard target', () => {
    const guesses = guessTagCombines([
      { tags: ['bible study'] },
      { tags: ['Bible Study'] },
      { tags: ['Bible Study'] },
      { tags: ['BIBLE STUDY'] },
    ]);
    expect(guessFor(guesses, 'Bible Study', 'strong')).toBeDefined();
  });

  it('uses the standard tags passed in as the anchor source', () => {
    const guesses = guessTagCombines([{ tags: ['Welcome table'] }], ['Welcome']);
    const guess = guessFor(guesses, 'Welcome', 'strong')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('standard-context');
  });

  it('never guesses different seasons together', () => {
    const guesses = guessTagCombines([{ tags: ['Fall 2025', 'Fall 2026'] }]);
    expect(guesses).toEqual([]);
  });

  it('still folds spelling variants of the same season', () => {
    const guesses = guessTagCombines([{ tags: ["Fall '26", 'Fall 2026'] }]);
    const guess = guessFor(guesses, 'Fall 2026', 'strong')!;
    expect(guess).toBeDefined();
    expect(guess.variants).toEqual(["Fall '26"]);
  });

  it('counts the affected contacts per guess', () => {
    const guesses = guessTagCombines([
      { tags: ['BFA table'] },
      { tags: ['bfa-table'] },
      { tags: ['BFA'] },
    ]);
    expect(guessFor(guesses, 'BFA', 'strong')!.contactCount).toBe(2);
  });
});

describe('planTagApplies', () => {
  it('applies the combine and removes duplicate tags on each contact', () => {
    const contacts = [
      { id: '1', name: 'S1', tags: ['BFA table', 'BFA'] },
      { id: '2', name: 'S2', tags: ['BFA table'] },
      { id: '3', name: 'S3', tags: ['Saved'] },
    ];
    expect(planTagApplies(contacts, [{ variants: ['BFA table'], target: 'BFA' }])).toEqual([
      { contactId: '1', name: 'S1', from: ['BFA table', 'BFA'], to: ['BFA'] },
      { contactId: '2', name: 'S2', from: ['BFA table'], to: ['BFA'] },
    ]);
  });

  it('reflects an edited target', () => {
    const contacts = [{ id: '1', name: 'S1', tags: ['bible studies'] }];
    expect(
      planTagApplies(contacts, [{ variants: ['bible studies'], target: 'Bible study' }]),
    ).toEqual([
      { contactId: '1', name: 'S1', from: ['bible studies'], to: ['Bible study'] },
    ]);
  });

  it('only plans rows that would actually change', () => {
    const contacts = [{ id: '1', name: 'S1', tags: ['Saved'] }];
    expect(planTagApplies(contacts, [{ variants: ['Saved'], target: 'Saved' }])).toEqual([]);
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
    expect(isSeasonTag('Fall table')).toBe(false);
  });

  it('falls back to the seed when the document has not loaded', () => {
    expect(resolveStandardTags(undefined)).toEqual(STANDARD_TAG_SEED);
    expect(resolveStandardTags(null)).toEqual(STANDARD_TAG_SEED);
  });

  it('keeps a loaded list (empty stays empty) and normalizes it', () => {
    expect(resolveStandardTags([])).toEqual([]);
    expect(resolveStandardTags(['Welcome', 'welcome'])).toEqual(['Welcome']);
  });

  it('treats season tags as standard for guessing without storing them', () => {
    const tags = standardTagsForGuessing(['Welcome'], [{ tags: ['Fall 2025', "Fall '26"] }]);
    expect(tags).toContain('Welcome');
    expect(tags).toContain('Fall 2025');
    expect(tags).toContain('Fall 2026');
  });

  it('uses the stored standard list as the guess target', () => {
    const guesses = guessTagCombines([{ tags: ['Welcome table'] }], resolveStandardTags(['Welcome']));
    expect(guessFor(guesses, 'Welcome', 'strong')).toBeDefined();
  });

  it('removing a standard tag never mutates contacts', () => {
    const contacts = [{ id: '1', name: 'A', tags: ['BFA table'] }];
    const before = JSON.parse(JSON.stringify(contacts));
    guessTagCombines(contacts, resolveStandardTags(['Saved']));
    expect(contacts).toEqual(before);
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

