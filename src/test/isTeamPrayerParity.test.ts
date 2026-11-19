// Mirror parity (#1406, §21): "does this burden belong on the team page?" is
// answered on the web by src/lib/prayers.ts and on the phone by
// packages/core/src/prayerThread.ts. The web app deliberately has no @cisa/core
// dependency (see the note at the top of src/lib/goal.ts), so the two copies
// must agree here or a prayer shows on one surface and not the other.
//
// §21 moved the question from the prayer to the person: the same rule applies
// to `isOnTeamPrayer`, which reads the contact's flag (and, until the migration
// has run, a legacy per-prayer flag when the person has none yet).
import { describe, it, expect } from 'vitest';
import { isTeamPrayer as webIsTeamPrayer, isOnTeamPrayer as webIsOnTeamPrayer } from '../lib/prayers';
import {
  isTeamPrayer as coreIsTeamPrayer,
  isOnTeamPrayer as coreIsOnTeamPrayer,
} from '../../packages/core/src/prayerThread';

describe('isTeamPrayer web/core parity', () => {
  it.each([
    ['absent (legacy prayers)', undefined, true],
    ['true', true, true],
    ['false', false, false],
  ])('agrees on %s', (_label, teamPrayer, expected) => {
    expect(webIsTeamPrayer({ teamPrayer })).toBe(expected);
    expect(coreIsTeamPrayer({ teamPrayer })).toBe(expected);
  });
});

describe('isOnTeamPrayer web/core parity', () => {
  // TRANSITIONAL (fix round 1): an un-stamped contact falls back to the old
  // per-prayer reading until the migration has run, so the second argument —
  // that person's prayers — is part of the question now.
  it.each([
    ['absent flag, team prayer', {}, [{ teamPrayer: true }], true],
    ['absent flag, flagless prayer', {}, [{}], true],
    ['absent flag, private prayers', {}, [{ teamPrayer: false }], false],
    ['true', { teamPrayer: true }, [], true],
    ['false', { teamPrayer: false }, [{ teamPrayer: true }], false],
    [
      'removed',
      { teamPrayer: true, prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'u-admin' } },
      [],
      false,
    ],
  ])('agrees on %s', (_label, contact, prayers, expected) => {
    expect(webIsOnTeamPrayer(contact, prayers)).toBe(expected);
    expect(coreIsOnTeamPrayer(contact, prayers)).toBe(expected);
  });
});
