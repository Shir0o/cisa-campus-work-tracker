/**
 * Keeps record ids out of the public issue tracker -- issue #1143 (from #1120/#1121).
 *
 * Feedback is auto-filed as an issue on a PUBLIC repo, and the body carries the
 * page the reporter was on. `/people/<contactId>` publishes a durable handle
 * for one person; the id is opaque and Firestore rules still gate the record,
 * but the pointer itself is the kind of thing a ministry app should not be
 * scattering into a Google-indexed tracker. ADR 0018 decision 7 made this call
 * for screenshots -- full fidelity on the Firestore doc, nothing in the issue.
 * The URL gets the same treatment: Firestore keeps what the client sent, and
 * only the issue body sees the redacted form.
 *
 * The route shape survives, because that is what makes a report actionable:
 * `/people/:id` still says which screen broke, and a readable slug like
 * `mark-fall-2026-2026-09-09` still says which week. A Firestore auto-id is 20
 * mixed-case alphanumerics, which no route word in this app looks like.
 */

/**
 * A token is a record id if it is long, URL-safe, and carries both cases.
 * Route words are lowercase (`bible-study`) and slugs add digits but never
 * capitals (`mark-fall-2026-2026-09-09`), so the two never collide.
 */
export function isOpaqueRecordId(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,}$/.test(token) && /[a-z]/.test(token) && /[A-Z]/.test(token);
}

/**
 * Replaces every record id in a URL with `:id`, leaving the rest byte-for-byte
 * intact. Works on a bare path too, so a caller that never had a full URL still
 * gets the guard. Whatever is not a string comes back untouched -- the caller
 * decides what an absent page means.
 */
export function redactRecordIds(url: string): string {
  if (typeof url !== 'string' || url === '') return url;
  return url.replace(/[A-Za-z0-9_-]+/g, (token) => (isOpaqueRecordId(token) ? ':id' : token));
}
