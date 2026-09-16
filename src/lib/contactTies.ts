/** The fields on a contact that grant a reader access, before they are
 * denormalised into `visibleTo`. Kept as its own shape so the helper can be
 * used by creation paths that have not yet written a `Contact` union. */
export interface ContactTies {
  createdBy?: string | null;
  addedBy?: string | null;
  owner?: string | null;
  coCreators?: string[] | null;
  founders?: string[] | null;
}

/**
 * The denormalised access list a contact should carry: every persisted tie,
 * de-duplicated and with null/empty ids dropped. This is the single source of
 * truth for `visibleTo` on both the client and (via the backfill) the server,
 * so the rules and the app cannot drift on who is tied to a person (#1024
 * phase 4). Founders join the list so a person brought in by a pair reaches
 * both of them from the moment the contact is written (#1049).
 *
 * Pure and dependency-free on purpose: the backfill script imports it without
 * pulling the client Firebase SDK into a Node admin process.
 */
export function visibleToOf(contact: ContactTies | null | undefined): string[] {
  if (!contact) return [];
  const ids = [
    contact.createdBy,
    contact.addedBy,
    contact.owner,
    ...(contact.coCreators || []),
    ...(contact.founders || []),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}
