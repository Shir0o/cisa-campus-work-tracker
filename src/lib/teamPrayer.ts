// The team-prayer reading, mirrored from packages/core/src/prayerThread.ts —
// keep the two in step (src/test/isTeamPrayerParity.test.ts proves it).
//
// It lives in its own module, away from src/lib/prayers.ts, so the reading has
// no Firebase dependency.

/** A contact as the team-prayer question needs it. */
export interface TeamPrayerContact {
  teamPrayer?: boolean;
  prayerListRemoved?: unknown;
}

/**
 * Whether the team carries this person on "On our hearts" (§21). Per person,
 * not per prayer: once true, every prayer of theirs shows on that page, and an
 * absent flag is off. The team's own removal always wins.
 */
export function isOnTeamPrayer(c: TeamPrayerContact): boolean {
  return !c.prayerListRemoved && c.teamPrayer === true;
}
