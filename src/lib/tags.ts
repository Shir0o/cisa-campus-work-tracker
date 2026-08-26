// Tag normalization/combining helpers for the web app.
//
// These mirror the @cisa/core helpers (the web app deliberately has no
// @cisa/core dependency). They are used by the directory's "Combine tags"
// dry-run tool and by sign-up writes so new contacts don't accumulate
// duplicate season-tag variants.

export function normalizeTag(tag: string): string {
  let value = (tag ?? '').trim().replace(/^#/, '').replace(/\s+/g, ' ');

  // "Fall '26", "Fall'26", "Fall ’26", "Fall 26", "Fall26", "Fall2025"
  // → "Fall 2026" / "Fall 2025"
  const seasonShort = value.match(/^(Spring|Summer|Fall|Winter)\s*['’]?\s*(\d{2}|\d{4})$/i);
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

export const TAG_SUGGESTIONS = [
  'Saved',
  'Baptized',
  'Freshman',
  'Sophomore',
  'Junior',
  'Senior',
  'Graduate',
  'Club Rush',
];

export type TagToneKey = 'slate' | 'clay' | 'ochre' | 'sage' | 'teal' | 'indigo' | 'plum' | 'rose';

const ALL_TAG_TONES: TagToneKey[] = ['slate', 'clay', 'ochre', 'sage', 'teal', 'indigo', 'plum', 'rose'];

export function tagToneKey(tag: string): TagToneKey {
  const t = (tag ?? '').toLowerCase().trim();
  if (t === 'new') return 'teal';
  if (t === 'saved' || t === 'baptized') return 'sage';
  if (t.includes('freshman') || t.includes('1st')) return 'teal';
  if (t.includes('sophomore') || t.includes('2nd')) return 'indigo';
  if (t.includes('junior') || t.includes('3rd')) return 'plum';
  if (t.includes('senior') || t.includes('4th') || t.includes('grad')) return 'ochre';
  if (t.includes('lead') || t.includes('trainee') || t.includes('staff')) return 'rose';
  if (t.includes('club') || t.includes('rush') || t.includes('outreach')) return 'clay';

  let hash = 0;
  for (let i = 0; i < t.length; i++) {
    hash = (hash << 5) - hash + t.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % ALL_TAG_TONES.length;
  return ALL_TAG_TONES[idx];
}

export function tagStyle(tag: string): React.CSSProperties {
  const k = tagToneKey(tag);
  return {
    '--tone': `var(--t-${k})`,
    '--tone-soft': `var(--t-${k}-soft)`,
  } as React.CSSProperties;
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

