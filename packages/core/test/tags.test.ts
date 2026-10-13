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
  levenshteinDistance,
  isFuzzyMatch,
  slugifyTag,
  parseSemesterTag,
  guessTagCombines,
  planTagApplies,
  planTagUndo,
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

describe('levenshteinDistance and isFuzzyMatch', () => {
  it('calculates correct edit distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('same', 'same')).toBe(0);
    expect(levenshteinDistance('', 'hello')).toBe(5);
    expect(levenshteinDistance('hello', '')).toBe(5);
    expect(levenshteinDistance('intersted', 'interested')).toBe(1);
    expect(levenshteinDistance('baptise', 'baptize')).toBe(1);
  });

  it('matches within threshold with isFuzzyMatch', () => {
    expect(isFuzzyMatch('intersted', 'interested', 1)).toBe(true);
    expect(isFuzzyMatch('baptise', 'baptize', 1)).toBe(true);
    expect(isFuzzyMatch('table', 'cable', 1)).toBe(true);
    expect(isFuzzyMatch('table', 'tent', 1)).toBe(false);
    expect(isFuzzyMatch('table', 'tent', 4)).toBe(true);
  });
});

describe('slugifyTag', () => {
  it('converts tag strings to URL-friendly lowercase slugs', () => {
    expect(slugifyTag('Club Rush')).toBe('club-rush');
    expect(slugifyTag('Fall 2026')).toBe('fall-2026');
    expect(slugifyTag('BFA Table #1!')).toBe('bfa-table-1');
    expect(slugifyTag('')).toBe('tag');
    expect(slugifyTag('---')).toBe('tag');
  });
});

describe('parseSemesterTag', () => {
  it('parses valid semester/season tags and normalizes season case', () => {
    expect(parseSemesterTag('Fall 2026')).toEqual({ season: 'Fall', year: 2026, label: 'Fall 2026' });
    expect(parseSemesterTag("Fall '26")).toEqual({ season: 'Fall', year: 2026, label: 'Fall 2026' });
    expect(parseSemesterTag('Spring26')).toEqual({ season: 'Spring', year: 2026, label: 'Spring 2026' });
    expect(parseSemesterTag('winter 27')).toEqual({ season: 'Winter', year: 2027, label: 'Winter 2027' });
    expect(parseSemesterTag('summer 2024')).toEqual({ season: 'Summer', year: 2024, label: 'Summer 2024' });
  });

  it('returns null for non-season tags or malformed seasons', () => {
    expect(parseSemesterTag('BFA')).toBeNull();
    expect(parseSemesterTag('Fall')).toBeNull();
    expect(parseSemesterTag('Fall 202')).toBeNull();
    expect(parseSemesterTag('Fall 20255')).toBeNull();
    expect(parseSemesterTag('Fallout 2025')).toBeNull();
  });
});

const guessFor = (
  guesses: ReturnType<typeof guessTagCombines>,
  target: string,
  tier: 'strong' | 'weak',
) => guesses.find((g) => g.target === target && g.tier === tier);

describe('guessTagCombines — tiers & heuristics', () => {
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

  it('marks standard tag plus context word as strong', () => {
    const guesses = guessTagCombines([{ tags: ['BFA table'] }, { tags: ['bfa-table'] }]);
    const guess = guessFor(guesses, 'BFA', 'strong')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('standard-context');
    expect(guess.variants.sort()).toEqual(['BFA table', 'bfa-table'].sort());
  });

  it('marks standard tag plus non-context word as weak', () => {
    const guesses = guessTagCombines([{ tags: ['BFA leaders'] }, { tags: ['BFA'] }]);
    const guess = guessFor(guesses, 'BFA', 'weak')!;
    expect(guess).toBeDefined();
    expect(guess.reasons).toContain('standard-extra');
    expect(guess.variants).toEqual(['BFA leaders']);
  });

  it('marks extra words as weak (Prayer walk table → Prayer walk)', () => {
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

  it('uses the standard tags passed in as the source of combine targets', () => {
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

  it('leaves a removed variant exactly as stored', () => {
    const contacts = [
      { id: '1', name: 'S1', tags: ['club-rush'] },
      { id: '2', name: 'S2', tags: ['club-rush', 'club rush'] },
    ];
    expect(planTagApplies(contacts, [{ variants: ['club rush'], target: 'Club Rush' }])).toEqual([
      { contactId: '2', name: 'S2', from: ['club-rush', 'club rush'], to: ['club-rush', 'Club Rush'] },
    ]);
  });

  it('keeps an unrelated non-normalised tag on an affected contact as stored', () => {
    const contacts = [{ id: '1', name: 'S1', tags: ['club-rush', "Fall '26", 'BFA table'] }];
    expect(planTagApplies(contacts, [{ variants: ['BFA table'], target: 'BFA' }])).toEqual([
      { contactId: '1', name: 'S1', from: ['club-rush', "Fall '26", 'BFA table'], to: ['club-rush', "Fall '26", 'BFA'] },
    ]);
  });

  it('does not touch a contact no enabled combine reaches', () => {
    const contacts = [{ id: '1', name: 'S1', tags: ['club-rush', 'club rush'] }];
    expect(planTagApplies(contacts, [{ variants: ['BFA table'], target: 'BFA' }])).toEqual([]);
  });

  it('still removes a duplicate the rewrite itself creates, case-insensitively', () => {
    const contacts = [
      { id: '1', name: 'S1', tags: ['bfa', 'BFA table', 'club-rush'] },
      { id: '2', name: 'S2', tags: ['BFA table', 'bfa-table'] },
    ];
    expect(
      planTagApplies(contacts, [{ variants: ['BFA table', 'bfa-table'], target: 'BFA' }]),
    ).toEqual([
      { contactId: '1', name: 'S1', from: ['bfa', 'BFA table', 'club-rush'], to: ['BFA', 'club-rush'] },
      { contactId: '2', name: 'S2', from: ['BFA table', 'bfa-table'], to: ['BFA'] },
    ]);
  });
});

describe('planTagUndo', () => {
  const entries = [
    { contactId: 'a', name: 'Alice', before: ['BFA table', 'BFA'], after: ['BFA'] },
    { contactId: 'b', name: 'Bob', before: ['bfa-table'], after: ['BFA'] },
    { contactId: 'c', name: 'Cara', before: ['Saved'], after: ['Saved'] },
  ];

  it('restores a contact whose tags still equal the combine result', () => {
    const plan = planTagUndo(entries, { a: ['BFA'], b: ['BFA'], c: ['Saved'] });
    expect(plan.restore).toEqual([
      { contactId: 'a', name: 'Alice', before: ['BFA table', 'BFA'], after: ['BFA'], current: ['BFA'] },
      { contactId: 'b', name: 'Bob', before: ['bfa-table'], after: ['BFA'], current: ['BFA'] },
      { contactId: 'c', name: 'Cara', before: ['Saved'], after: ['Saved'], current: ['Saved'] },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('skips a contact re-tagged after the combine and reports its current tags', () => {
    const plan = planTagUndo(entries, { a: ['BFA'], b: ['BFA', 'Fall 2026'], c: ['Saved'] });
    expect(plan.restore.map((row) => row.contactId)).toEqual(['a', 'c']);
    expect(plan.skipped).toEqual([
      {
        contactId: 'b',
        name: 'Bob',
        before: ['bfa-table'],
        after: ['BFA'],
        current: ['BFA', 'Fall 2026'],
      },
    ]);
  });

  it('skips a contact that no longer exists', () => {
    const plan = planTagUndo(entries, {});
    expect(plan.restore).toEqual([]);
    expect(plan.skipped.map((row) => row.contactId)).toEqual(['a', 'b', 'c']);
  });

  it('restores every entry when nothing changed', () => {
    const plan = planTagUndo(entries, { a: ['BFA'], b: ['BFA'], c: ['Saved'] });
    expect(plan.restore.map((row) => row.contactId)).toEqual(['a', 'b', 'c']);
    expect(plan.skipped).toEqual([]);
  });
});

