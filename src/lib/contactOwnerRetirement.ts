/**
 * Pure planner for the re-runnable owner retirement (issue #1053 follow-up).
 *
 * #1053 removed the caregiver field from the code — there is no owner of a
 * contact, only its founders, the teammates deliberately added to it, and
 * whoever has taken it into their sheep. It shipped no migration, so two things
 * are still true of the stored documents:
 *
 *  1. `owner` is still on them, as dead data no reader consults.
 *  2. `visibleTo` still holds whoever that `owner` was. The access list was
 *     derived from the ties *including* the caregiver, and nothing has
 *     recomputed it since the tie stopped existing — so an ex-caregiver with no
 *     other tie still passes the rules' read check. That is a stale grant, and
 *     the Firestore rules cannot see that it is stale: the list honestly says
 *     they may read.
 *
 * This planner proposes, per contact, dropping the field and recomputing the
 * access list from the ties that remain. `losesAccess` is the column worth
 * reading before committing: those readers can open the person today and will
 * not afterwards. Under the model #1044 settled that is correct — care is the
 * carer tie now, and a caregiver who never took the person into their sheep
 * holds nothing — but it is a real change to who sees whom, so it is reported
 * rather than applied quietly.
 *
 * Idempotent: a contact carrying no `owner` whose access list already matches
 * its ties is skipped, so re-running after a partial run finishes the job
 * rather than restarting it.
 *
 * Pure and dependency-free on purpose, like its sibling planners: the migration
 * script imports it without pulling the client Firebase SDK into a Node admin
 * process.
 */
import { visibleToOf, type ContactTies } from './contactTies';

export interface OwnerRetirementContact extends ContactTies {
  id: string;
  /** The retired caregiver field, where the document still carries it. */
  owner?: string | null;
  visibleTo?: string[] | null;
}

export interface OwnerRetirementRow {
  id: string;
  /** The caregiver uid to delete from the document, when one is stored. */
  ownerDropped: string | null;
  /** Whether the document still carries the field at all (even as null). */
  fieldPresent: boolean;
  visibleToFrom: string[];
  visibleToTo: string[];
  /** Readers who can open this person today and will not after the write. */
  losesAccess: string[];
  /** Readers a tie entitles who were missing from the stored list. */
  gainsAccess: string[];
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/**
 * Build the list of contacts that need an owner-retirement write. Pass every
 * contact; the planner decides which ones have anything to do.
 */
export function planContactOwnerRetirement(
  contacts: readonly OwnerRetirementContact[],
): OwnerRetirementRow[] {
  const rows: OwnerRetirementRow[] = [];
  for (const contact of contacts) {
    const fieldPresent = 'owner' in contact;
    const ownerDropped =
      typeof contact.owner === 'string' && contact.owner.length > 0 ? contact.owner : null;
    const visibleToFrom = Array.isArray(contact.visibleTo) ? contact.visibleTo : [];
    // The access list the surviving ties entitle. `owner` is deliberately not
    // among them: visibleToOf is the definition of who may read a person, and
    // the caregiver stopped being a tie in #1053.
    const visibleToTo = visibleToOf(contact);
    if (!fieldPresent && sameSet(visibleToFrom, visibleToTo)) continue;
    rows.push({
      id: contact.id,
      ownerDropped,
      fieldPresent,
      visibleToFrom,
      visibleToTo,
      losesAccess: visibleToFrom.filter((uid) => !visibleToTo.includes(uid)),
      gainsAccess: visibleToTo.filter((uid) => !visibleToFrom.includes(uid)),
    });
  }
  return rows;
}
