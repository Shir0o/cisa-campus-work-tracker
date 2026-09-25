// Shared "find a person" matching for the web app — word-boundary, name-first
// (#1192). Mirror of packages/core/src/contactMatch.ts, kept in step by
// src/test/contactMatchParity.test.ts (the web app deliberately has no
// @cisa/core dependency — see the note at the top of src/lib/goal.ts).
import type { Contact } from '../types';

export type ContactMatchQuality = 'name' | 'field';

export interface ContactMatch {
  quality: ContactMatchQuality;
  matchedExtras: string[];
}

/** Word-boundary prefix match: a field matches when every whitespace-token of
 *  the needle is a prefix of some whole word in the value. "ian" matches
 *  "Ian" but not "Christian"; "club fair" matches "Met at the club fair".
 *  Case-insensitive. An empty/whitespace needle matches everything. */
export function wordPrefixMatch(value: string | undefined, needle: string): boolean {
  const tokens = needle.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const words = (value ?? '').toLowerCase().split(/\s+/);
  return tokens.every((tok) => words.some((w) => w.startsWith(tok)));
}

/** Name-first, word-boundary matcher for one contact. `fields` are the
 *  contact's searchable non-name values (each surface keeps its own set);
 *  `extras` are additional values to match that are not on the contact (the
 *  Directory's founder/carer/co-creator display names). Returns null when
 *  nothing matches, so a caller can filter and tier with one call. */
export function matchContact(
  contact: Pick<Contact, 'name'>,
  needle: string,
  fields: Array<string | undefined>,
  extras: string[] = [],
): ContactMatch | null {
  const q = needle.trim();
  if (!q) return null;
  if (wordPrefixMatch(contact.name, q)) return { quality: 'name', matchedExtras: [] };
  const matchedExtras = extras.filter((e) => wordPrefixMatch(e, q));
  if (fields.some((f) => wordPrefixMatch(f, q)) || matchedExtras.length > 0) {
    return { quality: 'field', matchedExtras };
  }
  return null;
}

/** Sort key for name-first tiering: name matches (0) above field matches (1).
 *  Null-safe so it can be used directly on a `matchContact` result. */
export function matchTier(m: ContactMatch | null): number {
  return m?.quality === 'name' ? 0 : 1;
}