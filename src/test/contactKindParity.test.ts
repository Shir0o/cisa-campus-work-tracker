// Mirror parity (#1152): the web app's kind derivation (src/lib/contactKind.ts)
// and the shared core's (packages/core/src/directory.ts) must give the same
// answer for every combination of `inChurchLife`, `isStudent` and the stamp,
// or the same person is a Local saint on one app and a Contact on the other.
//
// As with contactVisibilityParity, the two copies exist because this web app
// deliberately has no @cisa/core dependency (see the note at the top of
// src/lib/goal.ts); this corpus is the contract between the mirrors.
import { describe, it, expect } from 'vitest';
import {
  contactKind as webKind,
  isKindSorted as webSorted,
  kindMatches as webMatches,
  type KindFilter,
} from '../lib/contactKind';
// Direct relative import into the workspace package -- resolved for tests only.
import {
  contactKind as coreKind,
  isKindSorted as coreSorted,
  kindMatches as coreMatches,
} from '../../packages/core/src/directory';

const TRISTATE = [true, false, undefined] as const;
const STAMPS = [
  {},
  { kindSetBy: 'u1' },
  { kindSetAt: '2026-09-23T00:00:00.000Z' },
  { kindSetBy: 'u1', kindSetAt: '2026-09-23T00:00:00.000Z' },
] as const;
const FILTERS: KindFilter[] = ['all', 'unsorted', 'local-saint', 'our-own', 'contact'];

const CORPUS = TRISTATE.flatMap((inChurchLife) =>
  TRISTATE.flatMap((isStudent) =>
    STAMPS.map((stamp) => ({ inChurchLife, isStudent, ...stamp })),
  ),
);

describe('contactKind mirror parity (web vs core)', () => {
  it('covers every field combination', () => {
    expect(CORPUS).toHaveLength(36);
  });

  it('derives the same kind for every combination', () => {
    for (const c of CORPUS) {
      expect(webKind(c), JSON.stringify(c)).toBe(coreKind(c));
    }
  });

  it('agrees on whether a person has been sorted', () => {
    for (const c of CORPUS) {
      expect(webSorted(c), JSON.stringify(c)).toBe(coreSorted(c));
    }
  });

  it('agrees on every filter', () => {
    for (const c of CORPUS) {
      for (const f of FILTERS) {
        expect(webMatches(c, f), `${f} ${JSON.stringify(c)}`).toBe(coreMatches(c, f));
      }
    }
  });
});
