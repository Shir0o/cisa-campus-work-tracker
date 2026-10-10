// Mirror parity (#1406): "does this burden belong on the team page?" is
// answered on the web by src/lib/prayers.ts and on the phone by
// packages/core/src/prayerThread.ts. The web app deliberately has no @cisa/core
// dependency (see the note at the top of src/lib/goal.ts), so the two copies
// must agree here or a prayer shows on one surface and not the other.
import { describe, it, expect } from 'vitest';
import { isTeamPrayer as webIsTeamPrayer } from '../lib/prayers';
import { isTeamPrayer as coreIsTeamPrayer } from '../../packages/core/src/prayerThread';

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
