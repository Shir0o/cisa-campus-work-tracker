// "Is the person I'm about to add already here?" — the non-blocking duplicate
// warning shown on the add form (#1510). It reuses the Combine contacts
// detector's matcher (`checkCombineMatch`, ADR 0026) rather than introducing a
// second one: normalized email → phone → exact name, with the same priority the
// server's `findExistingContact` uses. The mobile mirror lives in
// `@cisa/core`'s `duplicateContact.ts`.
import type { Contact } from '../types';
import { checkCombineMatch } from './combineContactsPlan';

export type DuplicateMatchField = 'email' | 'phone' | 'name';

/** The fields a new person is compared on. */
export interface DuplicateMatchable {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface DuplicateContactMatch {
  contact: Contact;
  matchedOn: DuplicateMatchField;
}

const REASONS: Array<{ field: DuplicateMatchField; reason: string }> = [
  { field: 'email', reason: 'Matching email' },
  { field: 'phone', reason: 'Matching phone' },
  { field: 'name', reason: 'Matching name' },
];

/**
 * The first in-scope contact that looks like the person being added. Returns
 * null when nothing matches, so the add form only warns when there is a real
 * candidate.
 */
export function findDuplicateContact(
  entered: DuplicateMatchable,
  contacts: Contact[],
): DuplicateContactMatch | null {
  const probe = {
    id: '',
    name: entered.name ?? '',
    email: entered.email ?? '',
    phone: entered.phone ?? '',
  } as Contact;

  for (const { field, reason } of REASONS) {
    const contact = contacts.find((c) => checkCombineMatch(probe, c) === reason);
    if (contact) return { contact, matchedOn: field };
  }
  return null;
}
