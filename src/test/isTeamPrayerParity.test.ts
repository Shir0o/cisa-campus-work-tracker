// Mirror parity (#1406, §21): "is this person on the team prayer page?" is
// answered on the web by src/lib/prayers.ts and on the phone by
// packages/core/src/prayerThread.ts. The web app deliberately has no @cisa/core
// dependency (see the note at the top of src/lib/goal.ts), so the two copies
// must agree here or someone shows on one surface and not the other.
import { describe, it, expect } from 'vitest';
import { isOnTeamPrayer as webIsOnTeamPrayer } from '../lib/prayers';
import { isOnTeamPrayer as coreIsOnTeamPrayer } from '../../packages/core/src/prayerThread';

describe('isOnTeamPrayer web/core parity', () => {
  it.each([
    ['absent flag', {}, false],
    ['true', { teamPrayer: true }, true],
    ['false', { teamPrayer: false }, false],
    [
      'removed',
      { teamPrayer: true, prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'u-admin' } },
      false,
    ],
  ])('agrees on %s', (_label, contact, expected) => {
    expect(webIsOnTeamPrayer(contact)).toBe(expected);
    expect(coreIsOnTeamPrayer(contact)).toBe(expected);
  });
});
