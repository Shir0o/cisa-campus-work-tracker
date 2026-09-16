// The people holding a contact in their sheep (#1051): whoever has taken the
// person on, as display names. The tie is stored on the contact as `carers`, a
// list of uids; rendering needs names, so this resolves them against whatever
// uid → name map the caller has loaded.
//
// Standalone mirror of packages/core/src/carers.ts for the web app (which
// does not consume @cisa/core), kept in step by the parity tests.
import type { ContactTies } from './contactTies';

/** The display names of everyone holding this person in their sheep. Carers
 *  whose uid carries no name in the map are dropped — a carer you cannot name
 *  is not shown. */
export function carerNamesOf(
  carers: string[] | null | undefined,
  nameByUid: Record<string, string | undefined> | null | undefined,
): string[] {
  if (!Array.isArray(carers)) return [];
  const names: string[] = [];
  for (const uid of carers) {
    const name = nameByUid?.[uid]?.trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

/** Every persisted tie that grants reach except the carer tie (#1052). Taking
 *  someone into Your sheep never grants reach on its own — a carer keeps a
 *  person only while some other tie still holds them. */
export function reachWithoutCarers(contact: ContactTies | null | undefined): string[] {
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

/** The carer ties that survive removing `removedUid` from the contact's
 *  collaborators (#1052). A carer whose reach came only from the collaborator
 *  tie is dropped with it; a carer still held by another tie — a founder, a
 *  creator, an owner — keeps the person. */
export function carersAfterCollaboratorRemoval(
  contact: ContactTies | null | undefined,
  removedUid: string,
): string[] {
  if (!Array.isArray(contact?.carers)) return [];
  const reachAfter = reachWithoutCarers({
    ...contact,
    coCreators: (contact.coCreators || []).filter((id) => id !== removedUid),
  });
  return (contact.carers || []).filter((uid) => uid !== removedUid || reachAfter.includes(uid));
}