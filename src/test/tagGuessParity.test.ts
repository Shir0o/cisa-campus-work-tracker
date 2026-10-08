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
  planTagApplies as webPlan,
  type TagCombine,
} from '../lib/tags';
// Direct relative import into the workspace package -- resolved for tests only.
import {
  guessTagCombines as coreGuess,
  planTagApplies as corePlan,
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
  [''],
  [],
];

const CONTACTS = CORPUS.map((tags, index) => ({ id: `c${index}`, name: `C${index}`, tags }));

const STANDARD_SETS: string[][] = [
  ['Saved', 'Baptized', 'Interested', 'Open', 'Club Rush', 'BFA'],
  ['Welcome', 'BFA'],
];

const COMBINES: TagCombine[] = [
  { variants: ['BFA table', 'bfa-table'], target: 'BFA' },
  { variants: ['bible study', 'bible-study'], target: 'Bible study' },
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
});
