/**
 * Pure planner for the re-runnable contact `visibleTo` backfill
 * (issue #1024 phase 4).
 *
 * Contacts carry a denormalised access list -- `visibleTo` -- holding every
 * persisted tie: creator, adder, collaborators (`coCreators`), founders and
 * carers. The Firestore rules read it to enforce contact visibility
 * server-side, so every existing contact must be stamped before the read rule
 * tightens.
 *
 * The planner takes the current contact docs and returns the rows that need a
 * write. It is pure (no Firestore) and idempotent: a contact whose `visibleTo`
 * already equals the ties is skipped, so re-running the backfill after a
 * partial run finishes the job rather than restarting it.
 *
 * It mirrors ties and nothing more. It used to also reconcile Gospel Partners
 * -- stamping a Trainee's current partner into `coCreators` on every contact
 * that Trainee had ever anchored -- and that was removed outright in #1039: a
 * pairing that exists today is not evidence of collaboration that happened
 * terms ago, and `settings/partners` rewrites a term's entry in place, so no
 * term test can make a retroactive stamp correct. A partner tie is legitimate
 * only when written at creation, from the pairing that was real then; the
 * stamps already written are taken back by the repair planner in
 * ./contactPartnerStampRepair.ts.
 */
import { visibleToOf, type ContactTies } from './contactTies';

export interface ContactLike extends ContactTies {
  id: string;
  visibleTo?: string[] | null;
}

export interface BackfillRow {
  id: string;
  /** The access list read back (empty when the field is absent). */
  from: string[];
  /** The access list that should be written. */
  to: string[];
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
};

/**
 * Build the list of contacts whose `visibleTo` disagrees with their ties.
 */
export function planContactVisibleToBackfill(
  contacts: readonly ContactLike[],
): BackfillRow[] {
  const rows: BackfillRow[] = [];
  for (const contact of contacts) {
    const to = visibleToOf(contact);
    const from = Array.isArray(contact.visibleTo) ? contact.visibleTo : [];
    if (!sameSet(from, to)) {
      rows.push({ id: contact.id, from, to });
    }
  }
  return rows;
}
