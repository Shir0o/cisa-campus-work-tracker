/**
 * Pure planner for the one-time contact owner backfill (issue #685).
 *
 * The contact detail page's "Cared for by" is bound to `owner`. Contacts
 * created before this change were never stamped with an `owner`, so their
 * aside silently fell back to "Added by" — see the spec in issue #685.
 *
 * The planner takes a list of contact docs and returns the rows that need an
 * `owner` write. It is pure (no Firestore) and idempotent: a contact whose
 * `owner` is already a non-empty string is skipped, so re-running the
 * backfill against an already-migrated dataset is a no-op.
 *
 * The script at scripts/backfill-contact-owner.ts applies this plan in
 * 400-doc batches; this function is what the unit tests assert against.
 */
export interface ContactLike {
  id: string;
  owner?: string | null | undefined;
  createdBy?: unknown;
  addedBy?: unknown;
}

export interface BackfillRow {
  id: string;
  ownerFrom: string | null;
  ownerTo: string | null;
}

const hasOwner = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Build the list of contacts that need an `owner` write. Each row carries the
 * existing `owner` value (always null/undefined/empty here) and the resolved
 * `owner` to write (`createdBy` first, then `addedBy`, then null).
 */
export function planContactOwnerBackfill(
  contacts: readonly ContactLike[],
): BackfillRow[] {
  const rows: BackfillRow[] = [];
  for (const contact of contacts) {
    if (hasOwner(contact.owner)) continue;
    const fallback = hasOwner(contact.createdBy)
      ? contact.createdBy
      : hasOwner(contact.addedBy)
        ? contact.addedBy
        : null;
    rows.push({
      id: contact.id,
      ownerFrom: contact.owner ?? null,
      ownerTo: fallback,
    });
  }
  return rows;
}