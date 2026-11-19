// The team-prayer reading, mirrored from packages/core/src/prayerThread.ts —
// keep the two in step (src/test/isTeamPrayerParity.test.ts proves it).
//
// It lives in its own module, away from src/lib/prayers.ts, because the
// migration planner (src/lib/teamPrayerMigration.ts) and its script import it
// too: they must not pull the Firebase client in just to answer this question.
import type { PrayerRecord } from "../types";

/**
 * Whether a burden belongs on the team prayer page under the RETIRED
 * per-prayer rule. The log sheet's "Bring it to team prayer" toggle wrote
 * `teamPrayer: false` when a trainee kept a burden to themselves; an ABSENT
 * flag means team, so every prayer written before the toggle existed stays
 * where it was.
 *
 * §21 moved surfacing to the person — "On our hearts" reads
 * `isOnTeamPrayer(contact)`. This predicate still describes the stored flag on
 * a prayer, which the migration and the data-repair scripts read.
 */
export function isTeamPrayer(p: Pick<PrayerRecord, "teamPrayer">): boolean {
  return p.teamPrayer !== false;
}

/** A contact as the team-prayer question needs it. */
export interface TeamPrayerContact {
  teamPrayer?: boolean;
  prayerListRemoved?: unknown;
}

/**
 * Whether the team carries this person on "On our hearts" (§21). Per person,
 * not per prayer: once true, every prayer of theirs shows on that page.
 *
 * TRANSITIONAL (fix round 1) — remove the fallback once
 * `scripts/migrate-team-prayer-per-person.ts` has run. Rules and web deploy
 * with this change, but the migration runs later by hand, and installed phone
 * builds still write only the per-prayer flag. So a contact with NO per-person
 * flag (`undefined` — not `false`) counts while any of its prayers carries the
 * legacy team flag (`isTeamPrayer`, the same reading the migration's decision
 * uses). `false` always means off, and the team's own removal always wins.
 */
export function isOnTeamPrayer(
  c: TeamPrayerContact,
  prayers: Pick<PrayerRecord, "teamPrayer">[] = [],
): boolean {
  if (c.prayerListRemoved) return false;
  if (c.teamPrayer !== undefined) return c.teamPrayer === true;
  return prayers.some(isTeamPrayer);
}
