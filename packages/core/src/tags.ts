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

export interface TagPlanRow {
  contactId: string;
  name: string;
  from: string[];
  to: string[];
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
 * list serving both the suggestion chips and the combine targets. The stored
 * doc replaces it once it loads; season tags are standard by pattern, never
 * stored.
 */
export const STANDARD_TAG_SEED: string[] = [...TAG_SUGGESTIONS];

/** True when a tag names a season cohort ("Fall 2026") — standard by pattern. */
export function isSeasonTag(tag: string): boolean {
  return /^(Spring|Summer|Fall|Winter)\s+\d{4}$/.test(normalizeTag(tag));
}

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

/**
 * The standard tags plus every season tag the contacts carry: season tags are
 * standard by pattern without being stored, so the guesser prefers them too.
 */
export function standardTagsForGuessing(
  stored: string[] | null | undefined,
  contacts: Array<{ tags?: string[] | null }>,
): string[] {
  const tags = resolveStandardTags(stored);
  const seen = new Set(tags.map((tag) => normalizeTag(tag).toLowerCase()));
  for (const contact of contacts) {
    for (const value of contact.tags ?? []) {
      const norm = normalizeTag(value);
      if (!isSeasonTag(norm)) continue;
      const key = norm.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(norm);
    }
  }
  return tags;
}

export type TagGuessTier = 'strong' | 'weak';

export type TagGuessReason =
  | 'standard-context'
  | 'standard-extra'
  | 'case-punctuation'
  | 'extra-words'
  | 'typo';

export interface TagGuess {
  id: string;
  target: string;
  tier: TagGuessTier;
  reasons: TagGuessReason[];
  variants: string[];
  contactCount: number;
}

/** A set of tag variants and the target they should combine into (issue #1435). */
export interface TagCombine {
  variants: string[];
  target: string;
}

/** The season+year a tag names, or null; used to keep cohorts apart. */
function seasonOf(tag: string): string | null {
  const match = normalizeTag(tag).match(/^(Spring|Summer|Fall|Winter)\s+(\d{4})$/);
  return match ? `${match[1]} ${match[2]}` : null;
}

/** Canonical string for "differs only in case, punctuation or spacing". */
function foldTag(tag: string): string {
  return normalizeTag(tag).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function slugTagTag(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'tag';
}

interface RawTagInfo {
  raw: string;
  count: number;
  norm: string;
  fold: string;
  tokens: string[];
  season: string | null;
}

/**
 * Guess tag combines (issue #1435, spec #1426). Pure: given the contacts' tags
 * and the standard tags, it returns the strong guesses (case/punctuation/spacing
 * and standard+context) and the weak guesses (extra words, one-letter typos,
 * standard+non-context). Different seasons are never guessed together. Without
 * stored standard tags it falls back to the six TAG_SUGGESTIONS.
 */
export function guessTagCombines(
  contacts: Array<{ tags?: string[] | null }>,
  standardTags: string[] = TAG_SUGGESTIONS,
): TagGuess[] {
  const counts = new Map<string, number>();
  for (const contact of contacts) {
    const seen = new Set<string>();
    for (const value of contact.tags ?? []) {
      const raw = (value ?? '').trim();
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }

  const infos = new Map<string, RawTagInfo>();
  for (const [raw, count] of counts) {
    const norm = normalizeTag(raw);
    infos.set(raw, {
      raw,
      count,
      norm,
      fold: foldTag(raw),
      tokens: toAlphaTokens(norm),
      season: seasonOf(raw),
    });
  }

  const standardNorms = new Set(standardTags.map((tag) => normalizeTag(tag)));
  const isStandard = (info: RawTagInfo) => standardNorms.has(info.norm);

  type Bucket = {
    target: string;
    tier: TagGuessTier;
    reasons: Set<TagGuessReason>;
    variants: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  const assigned = new Map<string, string>();

  const add = (
    target: string,
    tier: TagGuessTier,
    reason: TagGuessReason,
    variants: string[],
  ) => {
    const key = `${tier}:${target.toLowerCase()}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { target, tier, reasons: new Set(), variants: new Set() };
      buckets.set(key, bucket);
    }
    bucket.reasons.add(reason);
    for (const variant of variants) {
      bucket.variants.add(variant);
      assigned.set(variant, key);
    }
  };

  // 1. Standard tag plus context words (strong) or other words (weak).
  //    Runs before the generic fold pass so `BFA table`, `BFA Table` and
  //    `bfa-table` all fold into the standard `BFA`, not into each other.
  for (const info of infos.values()) {
    if (assigned.has(info.raw) || info.season) continue;
    const compact = info.tokens.join('');
    for (const standardTag of standardTags) {
      const standardNorm = normalizeTag(standardTag);
      const standardTokens = toAlphaTokens(standardNorm);
      const standardCompact = standardTokens.join('');
      const isSuperset =
        info.tokens.length > standardTokens.length &&
        standardTokens.every((token) => info.tokens.includes(token));
      if (isSuperset) {
        const extras = info.tokens.filter((token) => !standardTokens.includes(token));
        const allContext = extras.every(
          (token) => CONTEXT_WORDS.has(token) || /^\d+$/.test(token),
        );
        add(
          standardNorm,
          allContext ? 'strong' : 'weak',
          allContext ? 'standard-context' : 'standard-extra',
          [info.raw],
        );
        break;
      }
      if (compact.startsWith(standardCompact) && compact.length > standardCompact.length) {
        const remainder = compact.slice(standardCompact.length);
        if (CONTEXT_WORDS.has(remainder) || /^\d+$/.test(remainder)) {
          add(standardNorm, 'strong', 'standard-context', [info.raw]);
          break;
        }
      }
    }
  }

  // 2. Case / punctuation / spacing variants: fold-equal raws. Always strong.
  const foldGroups = new Map<string, string[]>();
  for (const info of infos.values()) {
    if (!info.fold || assigned.has(info.raw)) continue;
    const list = foldGroups.get(info.fold) ?? [];
    list.push(info.raw);
    foldGroups.set(info.fold, list);
  }
  for (const list of foldGroups.values()) {
    if (list.length <= 1) continue;
    const standardMember = list.find((raw) => isStandard(infos.get(raw)!));
    let targetRaw = standardMember;
    if (!targetRaw) {
      const sorted = [...list].sort((a, b) => {
        const aInfo = infos.get(a)!;
        const bInfo = infos.get(b)!;
        if (bInfo.count !== aInfo.count) return bInfo.count - aInfo.count;
        const aTitle = /^[A-Z]/.test(aInfo.norm) ? 0 : 1;
        const bTitle = /^[A-Z]/.test(bInfo.norm) ? 0 : 1;
        if (aTitle !== bTitle) return aTitle - bTitle;
        return aInfo.norm.localeCompare(bInfo.norm);
      });
      targetRaw = sorted[0];
    }
    const target = normalizeTag(targetRaw!);
    const variants = list.filter((raw) => raw !== target);
    if (variants.length > 0) add(target, 'strong', 'case-punctuation', variants);
  }

  // 3. Any tag plus extra words: weak, into the closest shorter existing tag.
  const nonSeason = [...infos.values()].filter((info) => !info.season);
  for (const longer of nonSeason) {
    if (assigned.has(longer.raw)) continue;
    let best: RawTagInfo | null = null;
    for (const shorter of nonSeason) {
      if (shorter.raw === longer.raw) continue;
      if (shorter.tokens.length >= longer.tokens.length) continue;
      if (!shorter.tokens.every((token) => longer.tokens.includes(token))) continue;
      if (standardNorms.has(shorter.norm)) continue;
      if (shorter.norm === longer.norm) continue;
      if (
        !best ||
        shorter.tokens.length > best.tokens.length ||
        (shorter.tokens.length === best.tokens.length && shorter.count > best.count)
      ) {
        best = shorter;
      }
    }
    if (best) add(best.norm, 'weak', 'extra-words', [longer.raw]);
  }

  // 4. One-letter typos: weak. Standard tags (whether present or not) win.
  type Candidate = {
    raw: string;
    norm: string;
    tokens: string[];
    count: number;
    standard: boolean;
  };
  const candidates: Candidate[] = [];
  for (const info of nonSeason) {
    candidates.push({
      raw: info.raw,
      norm: info.norm,
      tokens: info.tokens,
      count: info.count,
      standard: standardNorms.has(info.norm),
    });
  }
  for (const standardTag of standardTags) {
    const norm = normalizeTag(standardTag);
    if (!candidates.some((candidate) => candidate.norm === norm)) {
      candidates.push({ raw: norm, norm, tokens: toAlphaTokens(norm), count: 0, standard: true });
    }
  }
  const score = (candidate: Candidate) => (candidate.standard ? 1000 : 0) + candidate.count;
  for (const candidate of candidates) {
    if (assigned.has(candidate.raw)) continue;
    if (candidate.tokens.length !== 1 || candidate.tokens[0].length <= 4) continue;
    let best: Candidate | null = null;
    for (const other of candidates) {
      if (other === candidate || other.tokens.length !== 1) continue;
      if (other.tokens[0].length <= 4 || other.norm === candidate.norm) continue;
      if (levenshteinDistance(candidate.tokens[0], other.tokens[0]) !== 1) continue;
      if (!best) {
        best = other;
        continue;
      }
      if (score(other) > score(best)) best = other;
      else if (score(other) === score(best)) {
        const bestTitle = /^[A-Z]/.test(best.norm) ? 0 : 1;
        const otherTitle = /^[A-Z]/.test(other.norm) ? 0 : 1;
        if (otherTitle < bestTitle) best = other;
      }
    }
    if (!best) continue;
    if (candidate.standard && !best.standard) add(candidate.norm, 'weak', 'typo', [best.raw]);
    else add(best.norm, 'weak', 'typo', [candidate.raw]);
  }

  const guesses: TagGuess[] = [];
  for (const bucket of buckets.values()) {
    const variants = [...bucket.variants];
    if (variants.length === 0) continue;
    let contactCount = 0;
    for (const contact of contacts) {
      const tags = (contact.tags ?? []).map((tag) => (tag ?? '').trim());
      if (variants.some((variant) => tags.includes(variant))) contactCount++;
    }
    guesses.push({
      id: `guess-${slugTagTag(bucket.target)}-${bucket.tier}`,
      target: bucket.target,
      tier: bucket.tier,
      reasons: [...bucket.reasons],
      variants,
      contactCount,
    });
  }

  guesses.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'strong' ? -1 : 1;
    if (b.contactCount !== a.contactCount) return b.contactCount - a.contactCount;
    return a.target.localeCompare(b.target);
  });
  return guesses;
}

/**
 * Rewrite only the tags that are variants of an enabled combine; every other
 * tag stays exactly as stored. A repeat is dropped only when the rewrite
 * itself created it (a rewritten tag equals another tag, case-insensitively).
 */
function rewriteCombinedTags(tags: string[], mapping: Map<string, string>): string[] {
  const result: Array<{ tag: string; rewritten: boolean }> = [];
  for (const tag of tags) {
    const target = mapping.get(tag);
    const rewritten = target !== undefined && target !== tag;
    const next = { tag: rewritten ? target : tag, rewritten };
    const key = next.tag.toLowerCase();
    const index = result.findIndex((entry) => entry.tag.toLowerCase() === key);
    if (index === -1) {
      result.push(next);
    } else if (next.rewritten || result[index].rewritten) {
      result[index] = { tag: next.rewritten ? next.tag : result[index].tag, rewritten: true };
    } else {
      result.push(next);
    }
  }
  return result.map((entry) => entry.tag);
}

/**
 * Build the contact tag changes for the enabled, edited combines (issue #1435).
 * Pure: the browser preview and the server share it so they agree.
 */
export function planTagApplies(
  contacts: Array<{ id: string; name: string; tags?: string[] | null }>,
  combines: TagCombine[],
): TagPlanRow[] {
  const mapping = new Map<string, string>();
  for (const combine of combines ?? []) {
    const target = normalizeTag(combine.target ?? '');
    for (const variant of combine.variants ?? []) {
      const raw = (variant ?? '').trim();
      if (raw && target) mapping.set(raw, target);
    }
  }

  const rows: TagPlanRow[] = [];
  for (const contact of contacts) {
    const from = (contact.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
    const to = rewriteCombinedTags(from, mapping);
    const unchanged = from.length === to.length && from.every((tag, index) => tag === to[index]);
    if (!unchanged) {
      rows.push({ contactId: contact.id, name: contact.name, from, to });
    }
  }
  return rows;
}

/** One affected contact in a tag combine record (issue #1435). */
export interface TagUndoEntry {
  contactId: string;
  name: string;
  before: string[];
  after: string[];
}

/** A contact the undo will restore or skip, with the tags it holds now. */
export interface TagUndoRow extends TagUndoEntry {
  current: string[];
}

export interface TagUndoPlan {
  restore: TagUndoRow[];
  skipped: TagUndoRow[];
}

/**
 * Plan the undo of a tag combine (issue #1436). A contact is restored only
 * while its current tags still equal what the combine wrote; a contact
 * re-tagged (or deleted) since is skipped and reported. Pure: the browser
 * preview and the server share it so they agree.
 */
export function planTagUndo(
  entries: TagUndoEntry[],
  currentTagsByContact: Record<string, string[] | null | undefined>,
): TagUndoPlan {
  const restore: TagUndoRow[] = [];
  const skipped: TagUndoRow[] = [];
  for (const entry of entries ?? []) {
    const raw = currentTagsByContact[entry.contactId] ?? null;
    const current = raw == null ? [] : raw.map((tag) => (tag ?? '').trim());
    const row: TagUndoRow = { ...entry, current };
    const unchanged =
      raw != null &&
      current.length === entry.after.length &&
      current.every((tag, index) => tag === entry.after[index]);
    (unchanged ? restore : skipped).push(row);
  }
  return { restore, skipped };
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

