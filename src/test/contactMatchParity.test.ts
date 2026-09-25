// Mirror parity (#1192): the web app's word-boundary name-first matcher
// (src/lib/contactMatch.ts) and the shared core's (packages/core/src/contactMatch.ts)
// must give the same answer for every query/field combination, or the same
// search surfaces "Ian" on one app and a wall of "christian" contacts on the other.
//
// As with contactKindParity, the two copies exist because this web app
// deliberately has no @cisa/core dependency (see the note at the top of
// src/lib/goal.ts); this corpus is the contract between the mirrors.
import { describe, it, expect } from 'vitest';
import {
  wordPrefixMatch as webWord,
  matchContact as webMatch,
  matchTier as webTier,
} from '../lib/contactMatch';
// Direct relative import into the workspace package -- resolved for tests only.
import {
  wordPrefixMatch as coreWord,
  matchContact as coreMatch,
  matchTier as coreTier,
} from '../../packages/core/src/contactMatch';

const NEEDLES = ['', '   ', 'ian', 'IAN', 'christ', 'christian', 'club fair', 'julia', 'z', 'an'];
const FIELDS = [
  undefined,
  '',
  'Ian',
  'Ian Smith',
  'Christian',
  'christian@example.com',
  'Met at the club fair',
  'Fall2026',
  'Julia Chen',
  'Smith',
];
const EXTRAS = ['Julia Chen', 'Sarah Founder', 'Mark Carer', ''];

describe('contactMatch mirror parity (web vs core)', () => {
  it('wordPrefixMatch agrees for every needle/value pair', () => {
    for (const needle of NEEDLES) {
      for (const value of FIELDS) {
        expect(webWord(value, needle)).toBe(coreWord(value, needle));
      }
    }
  });

  it('matchContact agrees for every needle/field/extras combination', () => {
    for (const needle of NEEDLES) {
      for (const field of FIELDS) {
        for (const extras of EXTRAS) {
          const web = webMatch({ name: 'Alex' }, needle, [field], [extras]);
          const core = coreMatch({ name: 'Alex' }, needle, [field], [extras]);
          expect(web).toEqual(core);
        }
      }
    }
  });

  it('matchContact agrees on name-first tiering', () => {
    for (const needle of ['ian', 'julia', 'christ', '']) {
      for (const name of FIELDS) {
        const web = webMatch({ name: name ?? '' }, needle, ['Christian']);
        const core = coreMatch({ name: name ?? '' }, needle, ['Christian']);
        expect(web).toEqual(core);
      }
    }
  });

  it('matchTier agrees on the name-first sort key', () => {
    for (const m of [null, webMatch({ name: 'Ian' }, 'ian', []), webMatch({ name: 'X' }, 'christ', ['Christian'])]) {
      expect(webTier(m)).toBe(coreTier(m));
    }
  });
});