/**
 * Pure planner for the one-off off-page prayer repair (issue #1418).
 *
 * `isTeamPrayer` (packages/core/src/prayerThread.ts, mirrored by
 * src/lib/prayers.ts) reads an ABSENT `teamPrayer` flag as the team's — correct
 * for every prayer written before the flag existed, since those were all
 * prayer-page prayers. But three off-page write paths also left the flag off,
 * so their contacts wrongly reach "On our hearts":
 *
 *   - the web contact-tab Prayer composer (until #1062 added `teamPrayer: false`),
 *   - the web "Log a visit" prayer field and the mobile contact-sheet Pray sheet
 *     (until #1406 added it).
 *
 * The code fix that stops new off-page prayers is #1406; this planner repairs
 * the rows already written. The judgment is here so it can be unit tested
 * without a Firestore dependency; the script
 * (scripts/repair-off-page-prayers.ts) only does the I/O.
 *
 * Signals, most trusting first:
 *   - `visit-link`: the prayer is named by a `visits` doc's `prayerId`. A visit
 *     prayer is unambiguously the contact's, so the link alone decides.
 *   - `no-prayer-page`: the doc has no `prayerPage` stamp. Every prayer-page
 *     write has stamped `prayerPage: true` since the page was created (verified
 *     in #250's history), so an absent stamp means the web contact tab wrote it
 *     off-page.
 *   - `activity-only`: `prayerPage: true` but an add-prayer activity exists for
 *     the contact. The phone Pray sheet logs that action, but so does the prayer
 *     page, so this is NOT enough to classify — it is a question, never a write.
 *   - `prayer-page`: `prayerPage: true` with no off-page evidence — a team
 *     prayer, left alone.
 *
 * A prayer already carrying `teamPrayer` (true or false) is never a candidate.
 * The only field the repair adds is `teamPrayer: false`; nothing is deleted.
 * Idempotent: a repaired prayer now carries the flag, so a re-run writes nothing.
 */

export interface OffPagePrayerInput {
  id: string;
  contactId: string;
  /** ABSENT means team — read through `isTeamPrayer`, never bare truthiness. */
  teamPrayer?: boolean | null;
  /** Whether this doc was written from the prayer page. */
  prayerPage?: boolean | null;
}

/** The slice of a `visits` doc that links it to the prayer it produced. */
export interface VisitPrayerLink {
  prayerId?: string | null;
  /** Corroborating denormalisation; never moves an outcome on its own. */
  prayerBurden?: string | null;
}

/** The slice of an `activities` doc that records adding a prayer burden. */
export interface PrayerActivity {
  action?: string | null;
  targetId?: string | null;
  targetType?: string | null;
}

export type PrayerRepairOutcome = 'write' | 'skip' | 'ask';

export type PrayerRepairSignal =
  | 'already-flagged'
  | 'no-prayer-page'
  | 'visit-link'
  | 'activity-only'
  | 'prayer-page';

export interface PrayerRepairRow {
  id: string;
  contactId: string;
  signal: PrayerRepairSignal;
  outcome: PrayerRepairOutcome;
  reason: string;
}

export interface PrayerRepairPlan {
  /** Every prayer reviewed, in the order supplied. */
  rows: PrayerRepairRow[];
  /** The rows to write `teamPrayer: false` to (outcome `write`). */
  writes: PrayerRepairRow[];
  /** The rows a human must decide on (outcome `ask`). Never written. */
  asks: PrayerRepairRow[];
}

/** The action both the prayer page and the phone Pray sheet log. */
export const ADD_PRAYER_ACTION = 'added a prayer burden for';

const isId = (id: unknown): id is string => typeof id === 'string' && id.length > 0;

const REASON: Record<PrayerRepairSignal, string> = {
  'already-flagged': 'already carries teamPrayer',
  'no-prayer-page': 'no prayerPage stamp: written off the prayer page',
  'visit-link': 'named by a visit as the burden it produced',
  'activity-only': 'prayerPage true but an add-prayer activity exists: prayer page and phone sheet look alike',
  'prayer-page': 'prayerPage true with no off-page evidence',
};

export function planOffPagePrayerRepair(
  prayers: readonly OffPagePrayerInput[],
  visits: readonly VisitPrayerLink[] = [],
  activities: readonly PrayerActivity[] = [],
): PrayerRepairPlan {
  const visitPrayerIds = new Set(visits.map((v) => v.prayerId).filter(isId));

  const activityContacts = new Set(
    activities
      .filter((a) => typeof a.action === 'string' && a.action.startsWith(ADD_PRAYER_ACTION))
      .map((a) => a.targetId)
      .filter(isId),
  );

  const rows: PrayerRepairRow[] = [];

  for (const p of prayers) {
    let signal: PrayerRepairSignal;
    let outcome: PrayerRepairOutcome;

    if (p.teamPrayer === true || p.teamPrayer === false) {
      signal = 'already-flagged';
      outcome = 'skip';
    } else if (visitPrayerIds.has(p.id)) {
      signal = 'visit-link';
      outcome = 'write';
    } else if (p.prayerPage !== true) {
      signal = 'no-prayer-page';
      outcome = 'write';
    } else if (activityContacts.has(p.contactId)) {
      signal = 'activity-only';
      outcome = 'ask';
    } else {
      signal = 'prayer-page';
      outcome = 'skip';
    }

    rows.push({ id: p.id, contactId: p.contactId, signal, outcome, reason: REASON[signal] });
  }

  return {
    rows,
    writes: rows.filter((r) => r.outcome === 'write'),
    asks: rows.filter((r) => r.outcome === 'ask'),
  };
}
