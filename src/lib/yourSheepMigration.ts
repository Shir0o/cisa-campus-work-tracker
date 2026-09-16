/**
 * Pure planner for the Your sheep migration (issue #1051).
 *
 * Your sheep used to live in each reader's private preferences
 * (`userPreferences/{uid}.personalContactIds`), which is exactly why "Cared
 * for by" could not be rendered from it — you cannot read other people's
 * preference documents. This ticket moves the tie onto the contact itself, as
 * `carers`, so it is something the rules can see. This planner decides which
 * contacts need the readers who already hold them written onto them.
 *
 * For every contact any reader has sheeped, the planner adds those readers to
 * the contact's carers and recomputes the access list in the same write. It is
 * idempotent: a contact whose carers and access list already match its
 * readers' preferences produces no write, so re-running after a partial run
 * finishes the job rather than restarting it. A reader holding a person who no
 * longer exists is skipped, nothing is lost, and nothing is guessed at.
 *
 * Pure and dependency-free on purpose, like ./contactPartnerStampRepair.ts:
 * the migration script imports it without pulling the client Firebase SDK into
 * a Node admin process.
 */
import { visibleToOf, type ContactTies } from './contactTies';

export interface SheepPrefDoc {
  uid: string;
  personalContactIds?: string[] | null;
}

export interface SheepContact extends ContactTies {
  id: string;
  visibleTo?: string[] | null;
}

export interface CarerMigrationRow {
  contactId: string;
  /** The readers to add as carers (empty when only the access list is stale). */
  addCarers: string[];
  /** The access list recomputed with the carers included, same write. */
  visibleToTo: string[];
}

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
};

/**
 * Build the list of contacts that need their carers — and their access list —
 * brought in step with the private Your sheep preferences. One row per contact,
 * aggregating every reader who holds it, so the writes never fight.
 */
export function planYourSheepMigration(
  prefs: readonly SheepPrefDoc[],
  contacts: readonly SheepContact[],
): CarerMigrationRow[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  // contact id → reader uids who hold it
  const readersByContact = new Map<string, string[]>();
  for (const p of prefs) {
    for (const contactId of new Set(ids(p.personalContactIds))) {
      if (!byId.has(contactId)) continue;
      const readers = readersByContact.get(contactId) || [];
      if (!readers.includes(p.uid)) readers.push(p.uid);
      readersByContact.set(contactId, readers);
    }
  }

  const rows: CarerMigrationRow[] = [];
  for (const [contactId, readers] of readersByContact) {
    const contact = byId.get(contactId)!;
    const existingCarers = ids(contact.carers);
    const addCarers = readers.filter((r) => !existingCarers.includes(r));
    const nextCarers = [...existingCarers, ...addCarers];
    const visibleToTo = visibleToOf({ ...contact, carers: nextCarers });
    // Idempotent: nothing to write when every reader is already a carer and
    // the access list already matches. A stale access list still gets repaired.
    if (addCarers.length === 0 && sameSet(ids(contact.visibleTo), visibleToTo)) continue;
    rows.push({ contactId, addCarers, visibleToTo });
  }
  return rows;
}