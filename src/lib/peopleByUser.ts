import type { Contact } from "../types";

export interface ContactCreatorGroup {
  /** Stable key for filtering/selection: the creator uid when known. */
  key: string;
  /** Human name shown in the "By teammate" list. */
  name: string;
  contacts: Contact[];
}

/**
 * People by teammate (#358): the team's contact list grouped by the person who
 * added each contact. This lets a trainee browse another user's people instead
 * of only seeing their own list. Groups are sorted by name so the page stays a
 * calm directory rather than a creation-time log.
 */
export function groupContactsByCreator(contacts: Contact[]): ContactCreatorGroup[] {
  const groups = new Map<string, ContactCreatorGroup>();
  for (const c of contacts) {
    const key = c.createdBy || c.addedBy || c.owner || "unassigned";
    const name = c.createdByName || (key === "unassigned" ? "Unassigned" : key);
    const group = groups.get(key) ?? { key, name, contacts: [] };
    group.contacts.push(c);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
