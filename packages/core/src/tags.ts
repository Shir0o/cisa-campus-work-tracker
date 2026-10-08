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
    // Find target by frequency, tie-break by Title Case / Capitalized
    const sorted = [...list].sort((a, b) => {
      const countDiff = (rawTagCounts.get(b) ?? 0) - (rawTagCounts.get(a) ?? 0);
      if (countDiff !== 0) return countDiff;
      const isTitleA = /^[A-Z]/.test(a);
      const isTitleB = /^[A-Z]/.test(b);
      if (isTitleA !== isTitleB) return isTitleA ? -1 : 1;
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
 * standard+non-context). Different seasons are never guessed together. Until
 * #1437 the anchors default to the six TAG_SUGGESTIONS.
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

  // 1. Standard anchor plus context words (strong) or other words (weak).
  //    Runs before the generic fold pass so `BFA table`, `BFA Table` and
  //    `bfa-table` all fold into the standard `BFA`, not into each other.
  for (const info of infos.values()) {
    if (assigned.has(info.raw) || info.season) continue;
    const compact = info.tokens.join('');
    for (const anchor of standardTags) {
      const anchorNorm = normalizeTag(anchor);
      const anchorTokens = toAlphaTokens(anchorNorm);
      const anchorCompact = anchorTokens.join('');
      const isSuperset =
        info.tokens.length > anchorTokens.length &&
        anchorTokens.every((token) => info.tokens.includes(token));
      if (isSuperset) {
        const extras = info.tokens.filter((token) => !anchorTokens.includes(token));
        const allContext = extras.every(
          (token) => CONTEXT_WORDS.has(token) || /^\d+$/.test(token),
        );
        add(
          anchorNorm,
          allContext ? 'strong' : 'weak',
          allContext ? 'standard-context' : 'standard-extra',
          [info.raw],
        );
        break;
      }
      if (compact.startsWith(anchorCompact) && compact.length > anchorCompact.length) {
        const remainder = compact.slice(anchorCompact.length);
        if (CONTEXT_WORDS.has(remainder) || /^\d+$/.test(remainder)) {
          add(anchorNorm, 'strong', 'standard-context', [info.raw]);
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

  // 4. One-letter typos: weak. Standard anchors (whether present or not) win.
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
  for (const anchor of standardTags) {
    const norm = normalizeTag(anchor);
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
    const to = normalizeTagList(from.map((tag) => mapping.get(tag) ?? normalizeTag(tag)));
    const unchanged = from.length === to.length && from.every((tag, index) => tag === to[index]);
    if (!unchanged) {
      rows.push({ contactId: contact.id, name: contact.name, from, to });
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

