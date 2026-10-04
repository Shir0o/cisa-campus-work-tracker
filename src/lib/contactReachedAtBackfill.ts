// Planner for the one-time reach-stamp backfill (#1335). Every path that logs
// an interaction or marks someone present now stamps the person `reachedAt`,
// but people reached before that carry no stamp, so a Full-timer whose screens
// read only the team's 500 newest interactions would still see them as Not
// reached yet. This plans the stamp from the whole record — every interaction
// and every Gathering — through the same reach model the screens use.
//
// Kept free of Firestore so it is unit tested; scripts/backfill-contact-reached-at.ts
// does the reads and writes.

import { reachByContact, type ReachGathering, type ReachInteraction, type ReachStamp } from './reach';

export interface ReachedAtBackfillInput {
  contacts: readonly ReachStamp[];
  interactions: readonly ReachInteraction[];
  gatherings: readonly ReachGathering[];
}

export interface ReachedAtBackfillRow {
  id: string;
  set: { reachedAt: string };
}

export interface ReachedAtBackfillPlan {
  rows: ReachedAtBackfillRow[];
  /** Reached, but by nothing that can be dated — reported, not stamped. */
  undated: string[];
}

/** Which people to stamp, and with which date: everyone reached who carries no
 *  stamp yet, dated by their newest reach. Idempotent — a stamped person is
 *  never rewritten, so a re-run after a partial one finishes the job. */
export function planReachedAtBackfill(input: ReachedAtBackfillInput): ReachedAtBackfillPlan {
  const reach = reachByContact({ interactions: input.interactions, gatherings: input.gatherings });
  const rows: ReachedAtBackfillRow[] = [];
  const undated: string[] = [];
  for (const contact of input.contacts) {
    if (contact.reachedAt) continue;
    const reading = reach.get(contact.id);
    if (!reading?.reached) continue;
    if (reading.ms == null) {
      undated.push(contact.id);
      continue;
    }
    rows.push({ id: contact.id, set: { reachedAt: new Date(reading.ms).toISOString() } });
  }
  return { rows, undated };
}
