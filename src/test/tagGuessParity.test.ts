// Mirror parity (#1435): the web app's tag guesser (src/lib/tags.ts) and the
// shared core's (packages/core/src/tags.ts) must give the same guesses and plan
// the same contact changes, or the mobile app would suggest combining tags the
// web app never would.
//
// The two copies exist because this web app deliberately has no @cisa/core
// dependency (see the note at the top of src/lib/tags.ts); this corpus is the
// contract between the mirrors.
import { describe, it, expect } from 'vitest';
import {
  guessTagCombines as webGuess,
  isSeasonTag as webIsSeasonTag,
  normalizeTag as webNormalizeTag,
  planTagApplies as webPlan,
  planTagUndo as webUndo,
  resolveStandardTags as webResolveStandardTags,
  standardTagsForGuessing as webStandardTagsForGuessing,
  type TagCombine,
} from '../lib/tags';
// Direct relative import into the workspace package -- resolved for tests only.
import {
  guessTagCombines as coreGuess,
  isSeasonTag as coreIsSeasonTag,
  normalizeTag as coreNormalizeTag,
  planTagApplies as corePlan,
  planTagUndo as coreUndo,
  resolveStandardTags as coreResolveStandardTags,
  standardTagsForGuessing as coreStandardTagsForGuessing,
} from '../../packages/core/src/tags';

const CORPUS: Array<Array<string> | null> = [
  ['club rush'],
  ['Club Rush'],
  ['club-rush'],
  ['BFA table'],
  ['bfa-table'],
  ['BFA Table'],
  ['BFA leaders'],
  ['BFA'],
  ['Prayer walk table'],
  ['Prayer walk'],
  ['intersted'],
  ['Interested'],
  ['bible study'],
  ['Bible Study'],
  ['bible-study'],
  ['Fall 2025'],
  ['Fall 2026'],
  ["Fall '26"],
  ['Saved'],
  ['saved'],
  ['club-rush', "Fall '26", 'BFA table'],
  ['bfa', 'bfa-table', 'Bible-Study'],
  ['bfa-table', 'Saved'],
  [''],
  [],
];

const CONTACTS = CORPUS.map((tags, index) => ({ id: `c${index}`, name: `C${index}`, tags }));

const STANDARD_SETS: string[][] = [
  ['Saved', 'Baptized', 'Interested', 'Open', 'Club Rush', 'BFA'],
  ['Welcome', 'BFA'],
];

// Every season spelling the app has seen, plus near misses that must not count
// as a season (a season word on its own, a stray suffix, a 3- or 5-digit year).
const SEASON_FORMS: string[] = [
  'Fall 2025',
  'Fall2025',
  'fall2025',
  'FALL 2025',
  'Spring26',
  "Spring '26",
  "Spring'26",
  'Spring ’26',
  'Winter 27',
  'summer 2024',
  'Summer99',
  'Fall',
  'Fall 202',
  'Fall 20255',
  'Fallout 2025',
  'Fall 2025 table',
];

const COMBINES: TagCombine[] = [
  { variants: ['BFA table', 'bfa-table'], target: 'BFA' },
  { variants: ['bible study', 'bible-study'], target: 'Bible study' },
];

// A guess the Full-timer edited: "club-rush" was removed, so it must not move.
const EDITED_COMBINES: TagCombine[] = [
  { variants: ['club rush'], target: 'Club Rush' },
  { variants: ['BFA table'], target: 'BFA' },
];

describe('tag guesser mirror parity (web vs core)', () => {
  it('guessTagCombines agrees for every standard-tag set', () => {
    for (const standard of STANDARD_SETS) {
      expect(webGuess(CONTACTS, standard)).toEqual(coreGuess(CONTACTS, standard));
    }
  });

  it('planTagApplies agrees for the edited combines', () => {
    expect(webPlan(CONTACTS, COMBINES)).toEqual(corePlan(CONTACTS, COMBINES));
  });

  it('planTagApplies agrees when a variant was removed and only combined tags are rewritten', () => {
    const web = webPlan(CONTACTS, EDITED_COMBINES);
    expect(web).toEqual(corePlan(CONTACTS, EDITED_COMBINES));
    // The removed variant and unrelated tags stay exactly as stored.
    expect(web.length).toBeGreaterThan(0);
    for (const row of web) {
      expect(row.to.includes('club-rush')).toBe(row.from.includes('club-rush'));
      expect(row.to.includes("Fall '26")).toBe(row.from.includes("Fall '26"));
    }
  });

  it('planTagUndo agrees for the same record and current tags', () => {
    const entries = [
      { contactId: 'c0', name: 'C0', before: ['club rush'], after: ['Club Rush'] },
      { contactId: 'c1', name: 'C1', before: ['BFA table'], after: ['BFA'] },
      { contactId: 'c2', name: 'C2', before: ['bible study'], after: ['Bible study'] },
    ];
    const current = { c0: ['Club Rush'], c1: ['BFA', 'Fall 2025'], c2: ['Bible study'] };
    expect(webUndo(entries, current)).toEqual(coreUndo(entries, current));
  });

  it('normalizeTag agrees for every season spelling', () => {
    for (const form of SEASON_FORMS) {
      expect(webNormalizeTag(form), form).toBe(coreNormalizeTag(form));
    }
    // The shared answer is the web one: compact and four-digit forms are spaced.
    expect(coreNormalizeTag('Fall2025')).toBe('Fall 2025');
    expect(coreNormalizeTag('spring 2026')).toBe('Spring 2026');
  });

  it('isSeasonTag agrees for every season spelling', () => {
    for (const form of SEASON_FORMS) {
      expect(webIsSeasonTag(form), form).toBe(coreIsSeasonTag(form));
    }
    expect(coreIsSeasonTag('Fall2025')).toBe(true);
  });

  it('resolveStandardTags agrees for stored lists with season spellings', () => {
    const stored = ['Fall2025', 'Fall 2025', 'BFA', 'bfa', "Spring '26"];
    for (const list of [stored, [], null, undefined]) {
      expect(webResolveStandardTags(list)).toEqual(coreResolveStandardTags(list));
    }
    expect(coreResolveStandardTags(stored)).toEqual(['Fall 2025', 'BFA', 'Spring 2026']);
  });

  it('standardTagsForGuessing agrees when contacts carry season spellings', () => {
    const contacts = SEASON_FORMS.map((tag, index) => ({ tags: [tag, `extra${index}`] }));
    for (const stored of [undefined, null, ['Saved', 'Fall2025'], []]) {
      expect(webStandardTagsForGuessing(stored, contacts)).toEqual(
        coreStandardTagsForGuessing(stored, contacts),
      );
    }
    expect(coreStandardTagsForGuessing([], contacts)).toContain('Fall 2025');
  });
});
