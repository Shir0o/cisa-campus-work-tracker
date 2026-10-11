import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTagList,
  TAG_SUGGESTIONS,
  tagToneKey,
  tagStyle,
  getEffectiveContactTags,
  guessTagCombines,
  planTagApplies,
  planTagUndo,
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
    // "club-rush" was removed from the guess; only "club rush" is still combined.
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

