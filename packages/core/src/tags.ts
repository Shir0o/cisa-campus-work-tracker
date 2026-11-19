// Tag normalization helpers.
//
// These are intentionally pure so they can be used by the sign-up writer, the
// contact forms' suggestion chips, and tests. They clean up the small
// variations that have crept into real contact data ("Fall '26" vs "Fall 2026",
// "club-rush" vs "Club Rush") without guessing at user-defined tag meanings.

export function normalizeTag(tag: string): string {
  let value = (tag ?? '').trim().replace(/^#/, '').replace(/\s+/g, ' ');

  // "Fall '26", "Fall'26", "Fall ’26", "Fall 26", "Fall26", "Fall2025"
  // → "Fall 2026" / "Fall 2025"
  const seasonShort = value.match(/^(Spring|Summer|Fall|Winter) ?['’]? ?(\d{2}|\d{4})$/i);
  if (seasonShort) {
    const season = seasonShort[1].charAt(0).toUpperCase() + seasonShort[1].slice(1).toLowerCase();
    const rawYear = seasonShort[2];
    const year = rawYear.length === 4
      ? Number(rawYear)
      : Number(rawYear) >= 50
        ? 1900 + Number(rawYear)
        : 2000 + Number(rawYear);
    return `${season} ${year}`;
  }

  // "club rush", "club-rush", "clubrush" → "Club Rush"
  if (/^club[- ]?rush$/i.test(value)) return 'Club Rush';

  return value;
}

/** Normalize, trim, and drop case-insensitive repeats of tags. */
export function normalizeTagList(tags: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags ?? []) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }

  return result;
}

export const TAG_SUGGESTIONS = [
  'Saved',
  'Baptized',
  'Interested',
  'Open',
  'Club Rush',
  'BFA',
];

/**
 * The seed for the standard tags document (ADR 0039): one Full-timer-edited
 * list serving the suggestion chips. The stored doc replaces it once it loads.
 */
export const STANDARD_TAG_SEED: string[] = [...TAG_SUGGESTIONS];

/**
 * Resolve the standard tags from the stored document's `tags` field (#1437).
 * `undefined`/`null` means the document has not loaded, so fall back to the
 * seed; a loaded-but-empty list stays empty. Order is preserved, values are
 * normalized, with case-insensitive repeats dropped.
 */
export function resolveStandardTags(stored?: string[] | null): string[] {
  if (stored == null) return [...STANDARD_TAG_SEED];
  return normalizeTagList(stored.filter((tag) => typeof tag === 'string'));
}

const DAY_MS = 86_400_000;
const parseMs = (s?: any): number | null => {
  if (!s) return null;
  if (typeof s?.toMillis === 'function') return s.toMillis();
  if (typeof s?.toDate === 'function') return s.toDate().getTime();
  if (typeof s?.seconds === 'number') return s.seconds * 1000;
  if (typeof s === 'number') return Number.isNaN(s) ? null : s;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};
const daysSince = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));

/**
 * Returns effective tags for a contact, normalizing user-assigned tags and
 * dynamically injecting 'new' if the contact was added within the last 5 days.
 */
export function getEffectiveContactTags(
  tags?: string[] | null,
  createdAt?: any,
): string[] {
  const normalized = normalizeTagList(tags);
  const ms = parseMs(createdAt);
  if (ms != null && daysSince(ms) <= 5) {
    if (!normalized.some((t) => t.toLowerCase() === 'new')) {
      return ['new', ...normalized];
    }
  }
  return normalized;
}
