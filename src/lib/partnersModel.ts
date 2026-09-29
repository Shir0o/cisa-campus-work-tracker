// Pure gospel-partner model — dated pairings, term keys and the module-level
// view creation paths read. No Firestore, so server.ts (run under tsx, where the
// client SDK module can't load) can share it. The Firestore I/O lives in
// ./partners, which re-exports everything here.
import { seasonForDate, SEASONS } from "./seasonCalendar";

/** term → groups of trainee uids (the legacy storage shape). */
export type PartnersByTerm = Record<string, string[][]>;

/** One stretch of time a set of trainees went out as one. The record is
 *  append-only: members and startDate never change, and ending it sets
 *  `endDate` rather than rewriting it. `endDate` absent means still open. */
export interface PartnerPairing {
  id: string;
  members: string[];
  /** First day the pairing applied, YYYY-MM-DD. */
  startDate: string;
  /** Last day it applied, YYYY-MM-DD; absent/null while still open. */
  endDate?: string | null;
}

/** Far-future sentinel so an open-ended pairing compares as still covering. */
const OPEN_END = "9999-12-31";

// ---- days & terms ----

/** The local calendar day a Date falls on, as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD day key by whole days. */
export function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDayKey = (value: unknown): value is string => typeof value === "string" && DATE_RE.test(value);

const dayToDate = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** The term key ("Fall 2026") a given date falls in. */
export function partnersTermKey(d: Date = new Date()): string {
  return `${SEASONS[seasonForDate(d)].label} ${d.getFullYear()}`;
}

/** The months a labelled term covers (0-indexed, inclusive). */
const TERM_MONTHS: Record<string, [number, number]> = {
  Winter: [0, 1],
  Spring: [2, 4],
  Summer: [5, 6],
  Fall: [7, 11],
};

/** First/last day of a term key ("Fall 2026"). Null when unknown. */
export function termBounds(term: string): { start: string; end: string } | null {
  const parts = (term || "").trim().split(" ").filter(Boolean);
  if (parts.length !== 2) return null;
  const label = parts[0][0].toUpperCase() + parts[0].slice(1);
  const months = TERM_MONTHS[label];
  const year = Number(parts[1]);
  if (!months || String(year) !== parts[1]) return null;
  return {
    start: dayKey(new Date(year, months[0], 1)),
    end: dayKey(new Date(year, months[1] + 1, 0)),
  };
}

// ---- legacy per-term groups (kept only for migration) ----

/** A partnership is two or more real people, no dups, no empties. */
export function cleanPartnerGroups(groups: string[][] | undefined | null): string[][] {
  return (groups || [])
    .map((g) => (g || []).filter((id, i, a) => !!id && a.indexOf(id) === i))
    .filter((g) => g.length > 1);
}

/** The groups recorded for one term, cleaned (legacy shape). */
export function groupsForTerm(byTerm: PartnersByTerm | undefined | null, term: string): string[][] {
  return cleanPartnerGroups(byTerm?.[term]);
}

// ---- dated records ----

const uniqIds = (ids: unknown): string[] =>
  Array.isArray(ids)
    ? ids
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .filter((id, i, a) => a.indexOf(id) === i)
    : [];

/** A stable id for a pairing: its members plus the day it began. */
export function pairingId(members: string[], startDate: string): string {
  return `${[...members].sort().join("+")}@${startDate}`;
}

/** Normalise a list of pairings: two-or-more real members, real days, and an
 *  end that is not before its start. Invalid records are dropped. */
export function cleanPairings(raw: readonly PartnerPairing[] | undefined | null): PartnerPairing[] {
  const out: PartnerPairing[] = [];
  for (const p of raw || []) {
    const members = uniqIds(p?.members);
    if (members.length < 2 || !isDayKey(p?.startDate)) continue;
    const endDate = isDayKey(p?.endDate) ? p.endDate : undefined;
    if (endDate && endDate < p.startDate) continue;
    out.push({ id: p.id || pairingId(members, p.startDate), members, startDate: p.startDate, ...(endDate ? { endDate } : {}) });
  }
  return out;
}

/** Whether a pairing applied on a given day (inclusive). */
export function pairingCovers(p: PartnerPairing, day: string): boolean {
  return p.startDate <= day && day <= (p.endDate || OPEN_END);
}

const sharesMember = (a: { members: string[] }, b: { members: string[] }): boolean =>
  a.members.some((id) => b.members.includes(id));

/** Whether two pairings' date ranges intersect. */
export function pairingsOverlap(a: PartnerPairing, b: PartnerPairing): boolean {
  const aEnd = a.endDate || OPEN_END;
  const bEnd = b.endDate || OPEN_END;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/** The recorded pairing that would overlap a proposed one, if any. Overlap only
 *  conflicts when the two share a person: one person goes out with one
 *  arrangement at a time. */
export function findOverlap(
  pairings: readonly PartnerPairing[] | undefined | null,
  members: string[],
  startDate: string,
  endDate: string | null = null,
): PartnerPairing | null {
  const candidate: PartnerPairing = { id: "", members: uniqIds(members), startDate, endDate };
  if (candidate.members.length < 2 || !isDayKey(startDate)) return null;
  return cleanPairings(pairings).find((p) => sharesMember(p, candidate) && pairingsOverlap(p, candidate)) ?? null;
}

/** Who `uid` went out with on `day`, read from the dated history. At most one
 *  pairing per person is ever open, so this is one answer for any covered day. */
export function partnersAt(
  pairings: readonly PartnerPairing[] | undefined | null,
  uid: string,
  day: string = dayKey(),
): string[] {
  const hit = cleanPairings(pairings).find((p) => p.members.includes(uid) && pairingCovers(p, day));
  return hit ? hit.members.filter((id) => id !== uid) : [];
}

/** The founding set of a contact created by `uid` on `day`: the creator plus
 *  everyone they were partnered with at that instant, read from the dated
 *  history. Exactly the creator when no pairing covered the day, and empty when
 *  there is no creator to found anything (#1049). */
export function foundingSet(
  pairings: readonly PartnerPairing[] | undefined | null,
  uid: string | null | undefined,
  day: string = dayKey(),
): string[] {
  if (!uid) return [];
  return [uid, ...partnersAt(pairings, uid, day)];
}

/** Pairings grouped by the term each began in, for the Settings history. */
export function pairingsByTerm(
  pairings: readonly PartnerPairing[] | undefined | null,
): Record<string, PartnerPairing[]> {
  const out: Record<string, PartnerPairing[]> = {};
  for (const p of cleanPairings(pairings).sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const term = partnersTermKey(dayToDate(p.startDate));
    (out[term] ||= []).push(p);
  }
  return out;
}

/** Turn the legacy per-term arrangement into dated records: each group runs from
 *  its term's first day to its last. The term containing `now` stays
 *  open-ended, because it is the live arrangement. An unrecognised term key
 *  keeps its group dated to `now`, so nothing is lost when bounds are unknown. */
export function migrateByTermToPairings(
  byTerm: PartnersByTerm | undefined | null,
  now: Date = new Date(),
): PartnerPairing[] {
  const current = partnersTermKey(now);
  const today = dayKey(now);
  const out: PartnerPairing[] = [];
  for (const [term, groups] of Object.entries(byTerm || {})) {
    const bounds = termBounds(term);
    for (const members of cleanPartnerGroups(groups)) {
      const startDate = bounds?.start ?? today;
      const endDate = term === current ? null : bounds?.end ?? startDate;
      out.push({ id: pairingId(members, startDate), members, startDate, ...(endDate ? { endDate } : {}) });
    }
  }
  return out;
}

// ---- append-only mutations (return a fresh list) ----

/** Append a pairing starting `startDate` (today by default). Returns the list
 *  unchanged when it would overlap an existing pairing of any member, so a
 *  person is never in two arrangements at once. */
export function openPairing(
  pairings: readonly PartnerPairing[] | undefined | null,
  members: string[],
  startDate: string = dayKey(),
  endDate: string | null = null,
): PartnerPairing[] {
  const next = cleanPairings(pairings);
  const cleanMembers = uniqIds(members);
  if (cleanMembers.length < 2 || !isDayKey(startDate)) return next;
  if (findOverlap(next, cleanMembers, startDate, endDate)) return next;
  return [...next, { id: pairingId(cleanMembers, startDate), members: cleanMembers, startDate, ...(endDate ? { endDate } : {}) }];
}

/** Close an open pairing on `endDate` (today by default), inclusive. An already
 *  closed pairing is left alone: correcting one means recording a new pairing. */
export function endPairing(
  pairings: readonly PartnerPairing[] | undefined | null,
  id: string,
  endDate: string = dayKey(),
): PartnerPairing[] {
  const next = cleanPairings(pairings);
  const index = next.findIndex((p) => p.id === id);
  if (index < 0 || next[index].endDate || !isDayKey(endDate) || endDate < next[index].startDate) return next;
  const closed = next.slice();
  closed[index] = { ...next[index], endDate };
  return closed;
}

/** Re-pairing: close whatever open pairing each member is in the day before
 *  `startDate`, then open the new group from `startDate`. Returns the list
 *  unchanged when the new group would overlap a pairing that cannot be closed
 *  (one already ended, or one that begins on/after `startDate`). */
export function rePair(
  pairings: readonly PartnerPairing[] | undefined | null,
  members: string[],
  startDate: string = dayKey(),
): PartnerPairing[] {
  const next = cleanPairings(pairings);
  const wanted = uniqIds(members);
  if (wanted.length < 2 || !isDayKey(startDate)) return next;
  const candidate: PartnerPairing = { id: pairingId(wanted, startDate), members: wanted, startDate };
  const shared = next.filter((p) => sharesMember(p, candidate));
  const closable = shared.filter((p) => {
    return !p.endDate && p.startDate < startDate;
  });
  const unclosable = shared.filter((p) => !closable.includes(p));
  if (unclosable.some((p) => pairingsOverlap(p, candidate))) return next;
  const before = shiftDay(startDate, -1);
  const closed = next.map((p) => (closable.includes(p) ? { ...p, endDate: before } : p));
  if (cleanPairings(closed).some((p) => sharesMember(p, candidate) && pairingsOverlap(p, candidate))) return next;
  return [...cleanPairings(closed), candidate];
}

// ---- module-level view of the arrangement ----
// Fed by applyPartners from a live subscription, the same pattern as the
// full-timer/trainee roster in ../walking.ts — creation paths read it
// synchronously without an extra Firestore read.
let CURRENT_PAIRINGS: PartnerPairing[] = [];
let CURRENT_TERM: string | null = null;
let CURRENT_DAY: string | null = null;

/** Replace the module-level view from a settings/partners read. Accepts either
 *  the dated records or a legacy byTerm map, which is migrated on the way in. */
export function applyPartners(
  input: readonly PartnerPairing[] | PartnersByTerm | null | undefined,
  now: Date = new Date(),
): void {
  try {
    CURRENT_TERM = partnersTermKey(now);
  } catch {
    CURRENT_TERM = null;
  }
  CURRENT_DAY = dayKey(now);
  CURRENT_PAIRINGS = Array.isArray(input) ? cleanPairings(input) : migrateByTermToPairings(input as PartnersByTerm, now);
}

/** The active term key currently tracked by module-level gospel partner
 *  settings. Mirrors the web app's copy in src/lib/partners.ts so
 *  canSeeContact can widen to a current-term partner. */
export function currentTermKey(): string {
  if (CURRENT_TERM) return CURRENT_TERM;
  try {
    return partnersTermKey();
  } catch {
    return "Fall 2026";
  }
}

/** The trainees going out with `uid` on `day` (the day of the last apply by
 *  default, i.e. today in production). */
export function partnersOf(uid?: string | null, day: string = CURRENT_DAY || dayKey()): string[] {
  return uid ? partnersAt(CURRENT_PAIRINGS, uid, day) : [];
}

/** Stamp a brand-new contact with the adder's partners as `coCreators`, so the
 *  other side of the pair sees it from the moment it's added. No-op when the
 *  adder has no partner then. */
export function stampPartners<T extends object>(data: T, byUid?: string | null): T {
  const withMe = partnersOf(byUid);
  if (!withMe.length) return data;
  const record = data as T & { coCreators?: string[] };
  record.coCreators = [...new Set([...(record.coCreators || []), ...withMe])];
  return data;
}

/** Stamp the founding set (#1049) on a brand-new contact: whoever logged it plus
 *  everyone they were partnered with at that moment, read from the dated history
 *  on the day of the last apply. Written once, here, at creation — no code path
 *  may add a founder to an existing contact. A creator with no live pairing
 *  still carries exactly themselves. */
export function stampFounders<T extends object>(data: T, byUid?: string | null): T {
  if (!byUid) return data;
  const record = data as T & { founders?: string[] };
  record.founders = foundingSet(CURRENT_PAIRINGS, byUid, CURRENT_DAY || dayKey());
  return data;
}
