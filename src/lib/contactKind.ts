// THE KIND OF PERSON (#1152, ADR 0030) — whether someone is a Local saint,
// Our own, or a Contact, derived from two booleans on the contact and never
// stored. "Saint" is deliberately not a value: in this team's usage every
// believer is a saint, including a student met on campus last week, so belief
// distinguishes nobody — the church life does.
//
// The web app has no @cisa/core dependency (see the note at the top of
// src/lib/goal.ts), so this is a standalone copy of the shared logic in
// packages/core/src/directory.ts. src/test/contactKindParity.test.ts is the
// contract between the two mirrors.
import type { Contact } from '../types';

/** A local who is not in the church life folds into `contact` alongside a
 *  student we just met; `isStudent` still tells them apart, it just does not
 *  change the bucket. */
export type ContactKind = 'local-saint' | 'our-own' | 'contact';

/** What the Directory's kind filter can be set to. */
export type KindFilter = ContactKind | 'all' | 'unsorted';

type Kinded = Pick<Contact, 'inChurchLife' | 'isStudent' | 'kindSetBy' | 'kindSetAt'>;

export function contactKind(c: Kinded): ContactKind {
  if (!c.inChurchLife) return 'contact';
  return c.isStudent ? 'our-own' : 'local-saint';
}

/** Whether a person's kind was decided by someone, rather than left at the
 *  default. Both halves of the stamp are required: a document carrying only
 *  one was not written by a decision. */
export function isKindSorted(c: Kinded): boolean {
  return !!c.kindSetBy && !!c.kindSetAt;
}

export function kindMatches(c: Kinded, filter: KindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unsorted') return !isKindSorted(c);
  return contactKind(c) === filter;
}

/** The i18n key for a kind's label. One map, so the Directory's options, the
 *  chip and the activity log can never drift apart. */
export function kindLabelKey(kind: ContactKind): string {
  return `contactKind.${kind.replace('-', '_')}`;
}
