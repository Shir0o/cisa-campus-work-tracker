/**
 * Pure planner for the re-runnable contact `visibleTo` backfill
 * (issue #1024 phase 4).
 *
 * Contacts carry a denormalised access list -- `visibleTo` -- holding every
 * persisted tie: creator, adder, caregiver (`owner`) and collaborators
 * (`coCreators`). The Firestore rules read it to enforce contact visibility
 * server-side, so every existing contact must be stamped before the read rule
 * tightens.
 *
 * The planner takes the current contact docs and returns the rows that need a
 * write. It is pure (no Firestore) and idempotent: a contact whose `visibleTo`
 * already equals the ties is skipped, so re-running the backfill after a
 * partial run finishes the job rather than restarting it.
 *
 * It also folds in the one-off Gospel Partners reconciliation: a person
 * brought in during a term is stamped into `coCreators` at creation, but
 * contacts created before that stamping existed were not. Given a
 * `partnersOf(uid)` lookup for the current term, a row can carry the partner
 * uids still missing from `coCreators` so the script adds them and recomputes
 * `visibleTo` in the same write (client and server then agree).
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
  /** Current-term partners missing from `coCreators`, added in the same write. */
  addCoCreators: string[];
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
};

/**
 * Build the list of contacts that need a `visibleTo` write. `partnersOf` is a
 * pure lookup of the current term's partners for a trainee uid; pass nothing
 * when only the access list should be recomputed.
 */
export function planContactVisibleToBackfill(
  contacts: readonly ContactLike[],
  partnersOf: (uid: string) => string[] = () => [],
): BackfillRow[] {
  const rows: BackfillRow[] = [];
  for (const contact of contacts) {
    const existing = (contact.coCreators || []).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    const anchor = contact.createdBy || contact.addedBy;
    const addCoCreators = anchor
      ? partnersOf(anchor).filter((uid) => !existing.includes(uid))
      : [];
    const coCreators = [...new Set([...existing, ...addCoCreators])];
    const to = visibleToOf({ ...contact, coCreators });
    const from = Array.isArray(contact.visibleTo) ? contact.visibleTo : [];
    if (addCoCreators.length > 0 || !sameSet(from, to)) {
      rows.push({ id: contact.id, from, to, addCoCreators });
    }
  }
  return rows;
}
