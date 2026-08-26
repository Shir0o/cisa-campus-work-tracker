// Tag normalization/combining helpers.
//
// These are intentionally pure so they can be used by the sign-up writer, the
// directory's "combine tags" dry-run tool, and tests. They clean up the small
// variations that have crept into real contact data ("Fall '26" vs "Fall 2026",
// "club-rush" vs "Club Rush") without guessing at user-defined tag meanings.

export function normalizeTag(tag: string): string {
  let value = (tag ?? '').trim().replace(/^#/, '').replace(/\s+/g, ' ');

  // "Fall '26", "Fall'26", "Fall ’26", "Fall 26" → "Fall 2026"
  const seasonShort = value.match(/^(Spring|Summer|Fall|Winter)\s*['’]?\s*(\d{2})$/i);
  if (seasonShort) {
    const season = seasonShort[1].charAt(0).toUpperCase() + seasonShort[1].slice(1).toLowerCase();
    const yy = Number(seasonShort[2]);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${season} ${year}`;
  }

  // "club rush", "club-rush", "clubrush" → "Club Rush"
  if (/^club[- ]?rush$/i.test(value)) return 'Club Rush';

  return value;
}

/** Normalize, trim, and de-duplicate tags case-insensitively. */
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

export interface TagPlanRow {
  contactId: string;
  name: string;
  from: string[];
  to: string[];
}

/** Build a dry-run plan of contacts whose tags would change after combining. */
export function planTagCombining(
  contacts: Array<{ id: string; name: string; tags?: string[] | null }>,
): TagPlanRow[] {
  const rows: TagPlanRow[] = [];

  for (const contact of contacts) {
    const from = (contact.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const to = normalizeTagList(from);

    const unchanged =
      from.length === to.length && from.every((tag, index) => tag === to[index]);

    if (!unchanged) {
      rows.push({
        contactId: contact.id,
        name: contact.name,
        from,
        to,
      });
    }
  }

  return rows;
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
 * dynamically injecting 'new' if the contact was added within the last 7 days.
 */
export function getEffectiveContactTags(
  tags?: string[] | null,
  createdAt?: any,
): string[] {
  const normalized = normalizeTagList(tags);
  const ms = parseMs(createdAt);
  if (ms != null && daysSince(ms) <= 7) {
    if (!normalized.some((t) => t.toLowerCase() === 'new')) {
      return ['new', ...normalized];
    }
  }
  return normalized;
}

