// "Is the person I'm about to add already here?" — the non-blocking duplicate
// warning shown on the add surfaces (#1510). It reuses the same normalized
// email → phone → exact-name rule the Combine contacts detector applies
// (ADR 0026): the web mirror lives in `src/lib/duplicateContact.ts`. This
// module is the platform-agnostic copy the mobile app consumes.
import type { Contact } from './types';

/** The fields a new person is compared on. */
export interface DuplicateMatchable {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Which field produced the match, for the warning copy. */
export type DuplicateMatchField = 'email' | 'phone' | 'name';

export interface DuplicateContactMatch {
  contact: Contact;
  matchedOn: DuplicateMatchField;
}

export function normalizeContactEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

export function normalizeContactPhone(phone?: string | null): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

export function normalizeContactName(name?: string | null): string {
  return name ? name.trim().toLowerCase() : '';
}

/**
 * The first in-scope contact that looks like the person being added, matched
 * on email first, then phone, then exact name — the same priority the server's
 * `findExistingContact` uses. Returns null when nothing matches, so the add
 * surface only warns when there is a real candidate.
 */
export function findDuplicateContact(
  entered: DuplicateMatchable,
  contacts: Contact[],
): DuplicateContactMatch | null {
  const email = normalizeContactEmail(entered.email);
  const phone = normalizeContactPhone(entered.phone);
  const name = normalizeContactName(entered.name);
  if (!email && !phone && !name) return null;

  if (email) {
    const contact = contacts.find((c) => normalizeContactEmail(c.email) === email);
    if (contact) return { contact, matchedOn: 'email' };
  }
  if (phone) {
    const contact = contacts.find((c) => normalizeContactPhone(c.phone) === phone);
    if (contact) return { contact, matchedOn: 'phone' };
  }
  if (name) {
    const contact = contacts.find((c) => normalizeContactName(c.name) === name);
    if (contact) return { contact, matchedOn: 'name' };
  }
  return null;
}
