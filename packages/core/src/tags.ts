// Tag normalization/combining helpers.
//
// These are intentionally pure so they can be used by the sign-up writer, the
// directory's "combine tags" dry-run tool, and tests. They clean up the small
// variations that have crept into real contact data ("Fall '26" vs "Fall 2026",
// "club-rush" vs "Club Rush") without guessing at user-defined tag meanings.

export function normalizeTag(tag: string): string {
  let value = (tag ?? '').trim().replace(/^#/, '').replace(/\s+/g, ' ');

  // "Fall '26", "Fall'26", "Fall ’26", "Fall 26" → "Fall 2026"
  const seasonMatch = value.match(/^(Spring|Summer|Fall|Winter)(.*)$/i);
  if (seasonMatch) {
    const rest = seasonMatch[2].trim().replace(/^['’]/, '').trim();
    if (/^\d{2}$/.test(rest)) {
      const season = seasonMatch[1].charAt(0).toUpperCase() + seasonMatch[1].slice(1).toLowerCase();
      const yy = Number(rest);
      const year = yy >= 50 ? 1900 + yy : 2000 + yy;
      return `${season} ${year}`;
    }
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

export interface TagCombineRule {
  id: string;
  from: string[];
  to: string;
  contactCount: number;
}

/** Calculate Levenshtein distance between two strings. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Clean a tag string down to lowercase alphanumeric tokens. */
function toAlphaTokens(tag: string): string[] {
  return (tag ?? '')
    .toLowerCase()
    .replace(/[-#_]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const CONTEXT_WORDS = new Set(['table', 'booth', 'tent', 'info', 'rush', 'tabling']);

/**
 * Identify clusters of tag variants across a collection of contacts.
 * Anchors from TAG_SUGGESTIONS and detected season tags take priority.
 */
export function clusterTags(
  contacts: Array<{ tags?: string[] | null }>,
): TagCombineRule[] {
  // 1. Gather all unique raw tags and their contact counts
  const rawTagCounts = new Map<string, number>();
  for (const c of contacts) {
    const seenOnContact = new Set<string>();
    for (const raw of c.tags ?? []) {
      const trimmed = (raw ?? '').trim();
      if (!trimmed || seenOnContact.has(trimmed)) continue;
      seenOnContact.add(trimmed);
      rawTagCounts.set(trimmed, (rawTagCounts.get(trimmed) ?? 0) + 1);
    }
  }

  // 2. Discover anchor targets (TAG_SUGGESTIONS + existing canonical season tags)
  const anchorSet = new Set<string>(TAG_SUGGESTIONS);
  for (const raw of rawTagCounts.keys()) {
    const norm = normalizeTag(raw);
    if (/^(Spring|Summer|Fall|Winter)\s+\d{4}$/.test(norm)) {
      anchorSet.add(norm);
    }
  }

  // Mapping from rawTag -> targetTag
  const rawToTarget = new Map<string, string>();

  // Pass A: Match against anchor targets
  for (const raw of rawTagCounts.keys()) {
    const norm = normalizeTag(raw);
    const tokens = toAlphaTokens(raw);
    const compactTokenStr = tokens.join('');

    let matchedAnchor: string | null = null;

    for (const anchor of anchorSet) {
      const anchorTokens = toAlphaTokens(anchor);
      const anchorCompact = anchorTokens.join('');

      // Exact match after basic normalization
      if (norm.toLowerCase() === anchor.toLowerCase()) {
        matchedAnchor = anchor;
        break;
      }

      // Compact match (e.g. "bfatable" vs "bfa")
      if (compactTokenStr.startsWith(anchorCompact)) {
        const remainder = compactTokenStr.slice(anchorCompact.length);
        if (!remainder || CONTEXT_WORDS.has(remainder)) {
          matchedAnchor = anchor;
          break;
        }
      }

      // Tokens match with context word suffixes/affixes (e.g. "BFA table", "Club rush table")
      if (tokens.length > anchorTokens.length) {
        const containsAnchorTokens = anchorTokens.every((at) => tokens.includes(at));
        const extraTokens = tokens.filter((t) => !anchorTokens.includes(t));
        const allExtraAreContext = extraTokens.every((et) => CONTEXT_WORDS.has(et) || /^\d+$/.test(et));
        if (containsAnchorTokens && allExtraAreContext) {
          matchedAnchor = anchor;
          break;
        }
      }

      // Typo tolerance (Levenshtein distance <= 1 for > 4 chars, <= 2 for >= 7 chars)
      if (anchorTokens.length === 1 && tokens.length === 1) {
        const aWord = anchorTokens[0];
        const tWord = tokens[0];
        const dist = levenshteinDistance(aWord, tWord);
        if (
          (aWord.length >= 7 && tWord.length >= 6 && dist <= 2) ||
          (aWord.length > 4 && tWord.length > 4 && dist <= 1)
        ) {
          matchedAnchor = anchor;
          break;
        }
      }
    }

    if (matchedAnchor) {
      rawToTarget.set(raw, matchedAnchor);
    }
  }

  // Pass B: Group remaining tags by simplified alphanumeric tokens
  const unmapped = Array.from(rawTagCounts.keys()).filter((t) => !rawToTarget.has(t));
  const groups = new Map<string, string[]>();

  for (const raw of unmapped) {
    const key = toAlphaTokens(raw).join(' ');
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(raw);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    if (list.length <= 1) continue;
    // Find target by frequency, tie-break by Title Case
    const sorted = [...list].sort((a, b) => {
      const countDiff = (rawTagCounts.get(b) ?? 0) - (rawTagCounts.get(a) ?? 0);
      if (countDiff !== 0) return countDiff;
      // Prefer capitalized
      return a.localeCompare(b);
    });
    const target = sorted[0];
    for (const item of list) {
      rawToTarget.set(item, target);
    }
  }

  // 3. Assemble rules
  const targetToFroms = new Map<string, Set<string>>();
  for (const [raw, target] of rawToTarget.entries()) {
    if (raw === target) continue;
    const froms = targetToFroms.get(target) ?? new Set<string>();
    froms.add(raw);
    targetToFroms.set(target, froms);
  }

  const rules: TagCombineRule[] = [];
  for (const [target, fromSet] of targetToFroms.entries()) {
    const from = Array.from(fromSet);
    // Count affected contacts
    let contactCount = 0;
    for (const c of contacts) {
      if ((c.tags ?? []).some((t) => fromSet.has(t?.trim()))) {
        contactCount++;
      }
    }
    rules.push({
      id: `rule-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      from,
      to: target,
      contactCount,
    });
  }

  return rules.sort((a, b) => b.contactCount - a.contactCount || a.to.localeCompare(b.to));
}

/** Build plan of contact tag changes given a set of active/enabled rule IDs. */
export function planTagCombiningWithRules(
  contacts: Array<{ id: string; name: string; tags?: string[] | null }>,
  rules: TagCombineRule[],
  enabledRuleIds: Set<string>,
): TagPlanRow[] {
  // Construct map of rawTag -> targetTag for active rules
  const mapping = new Map<string, string>();
  for (const rule of rules) {
    if (enabledRuleIds.has(rule.id)) {
      for (const f of rule.from) {
        mapping.set(f, rule.to);
      }
    }
  }

  const rows: TagPlanRow[] = [];

  for (const contact of contacts) {
    const from = (contact.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const toRaw = from.map((t) => mapping.get(t) ?? normalizeTag(t));
    const to = normalizeTagList(toRaw);

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

/** Build a dry-run plan of contacts whose tags would change after combining. */
export function planTagCombining(
  contacts: Array<{ id: string; name: string; tags?: string[] | null }>,
): TagPlanRow[] {
  const rules = clusterTags(contacts);
  const allRuleIds = new Set(rules.map((r) => r.id));
  return planTagCombiningWithRules(contacts, rules, allRuleIds);
}

export const TAG_SUGGESTIONS = [
  'Saved',
  'Baptized',
  'Interested',
  'Open',
  'Club Rush',
  'BFA',
];

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

