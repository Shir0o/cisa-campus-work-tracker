/**
 * Pure read-only planner for the Gospel Partner founding-set drift report
 * (issue #1049).
 *
 * A contact's `founders` list is written once, at creation, from the pairing
 * that was live at that instant — and nothing ever stamps it again. Because
 * the founding set is derivable from the dated pairing history and the
 * contact's creation time, the persisted list has an independent oracle to be
 * checked against: whenever the stored founders disagree with what the history
 * implies, that is a bug to read, never a write to make.
 *
 * The pairing history is append-only, so a drift can appear legitimately: a
 * Full-timer backdating a pairing's start moves what the history implies for
 * contacts created before the correction was entered. The report names those
 * contacts for a Full-timer to read; it never writes a founder to any of them.
 *
 * Contacts that carry no `founders` field predate #1049 and are out of scope —
 * they are the migration's job, not the report's. Contacts the report cannot
 * verify (no creator, no creation date) are flagged rather than guessed at.
 *
 * Pure and dependency-free on purpose, like ./contactPartnerStampRepair.ts:
 * the reporting script imports it without pulling the client Firebase SDK into
 * a Node admin process.
 */
import type { PartnerPairing } from './partners';

export type { PartnerPairing };

export interface FounderDriftContact {
  id: string;
  createdBy?: string | null;
  addedBy?: string | null;
  founders?: string[] | null;
  createdAt?: string | null;
}

export type FounderDriftOutcome = 'drift' | 'unverifiable';

export interface FounderDriftRow {
  contactId: string;
  /** The contact's creator, else its adder — the person who founded it. */
  anchor: string;
  /** The contact's creation day ('' when it carries no usable date). */
  createdAt: string;
  /** The founders stored on the contact. */
  stored: string[];
  /** What the pairing history implies for its creation time ('' when unverifiable). */
  implied: string[];
  outcome: FounderDriftOutcome;
  reason: 'founders-disagree' | 'no-anchor' | 'no-creation-date';
}

/** Local calendar day (YYYY-MM-DD) of an ISO timestamp, or null when unusable. */
const dayOf = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const OPEN_END = '9999-12-31';

const partnersAt = (
  pairings: readonly PartnerPairing[],
  uid: string,
  day: string,
): string[] => {
  const hit = pairings.find(
    (p) => p.members.includes(uid) && p.startDate <= day && day <= (p.endDate || OPEN_END),
  );
  return hit ? hit.members.filter((id) => id !== uid) : [];
};

/** The founders the pairing history implies for a contact created by `uid` on `day`. */
export function impliedFounders(
  pairings: readonly PartnerPairing[],
  uid: string | null | undefined,
  day: string | null,
): string[] {
  if (!uid || !day) return [];
  return [uid, ...partnersAt(pairings, uid, day)];
}

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
};

// ---- storage shape (settings/partners) ----
// The dated `{ pairings: [...] }` shape, or the legacy `{ byTerm: ... }` map
// migrated in memory. Mirrors packages/core's deserializePartners /
// migrateByTermToPairings, which the reporting script cannot import (they pull
// the client Firebase SDK into a Node admin process).

const TERM_MONTHS: Record<string, [number, number]> = {
  Winter: [0, 1],
  Spring: [2, 4],
  Summer: [5, 6],
  Fall: [7, 11],
};

const SEASON_BY_MONTH = [
  'Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
  'Summer', 'Fall', 'Fall', 'Fall', 'Fall', 'Fall',
];

const dayKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const termKeyOf = (d: Date): string => `${SEASON_BY_MONTH[d.getMonth()]} ${d.getFullYear()}`;

/** First/last day of a term key ("Fall 2026"), or null when unknown. */
const termBoundsOf = (term: string): { start: string; end: string } | null => {
  const parts = (term || '').trim().split(' ').filter(Boolean);
  if (parts.length !== 2) return null;
  const label = parts[0][0].toUpperCase() + parts[0].slice(1);
  const months = TERM_MONTHS[label];
  const year = Number(parts[1]);
  if (!months || String(year) !== parts[1]) return null;
  return {
    start: dayKeyOf(new Date(year, months[0], 1)),
    end: dayKeyOf(new Date(year, months[1] + 1, 0)),
  };
};

const uniqIds = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0).filter((id, i, a) => a.indexOf(id) === i)
    : [];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const cleanPairings = (raw: unknown): PartnerPairing[] => {
  if (!Array.isArray(raw)) return [];
  const out: PartnerPairing[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const members = uniqIds((p as { members?: unknown }).members);
    const startDate = (p as { startDate?: unknown }).startDate;
    const endDate = (p as { endDate?: unknown }).endDate;
    if (members.length < 2 || typeof startDate !== 'string' || !DATE_RE.test(startDate)) continue;
    if (typeof endDate === 'string' && DATE_RE.test(endDate) && endDate < startDate) continue;
    out.push({
      id: (p as { id?: unknown }).id as string || members.join('+') + '@' + startDate,
      members,
      startDate,
      ...(typeof endDate === 'string' && DATE_RE.test(endDate) ? { endDate } : {}),
    });
  }
  return out;
};

/** Turn the legacy per-term arrangement into dated records, mirroring the core. */
const migrateByTermToPairings = (byTerm: Record<string, unknown> | undefined | null, now: Date): PartnerPairing[] => {
  const current = termKeyOf(now);
  const today = dayKeyOf(now);
  const out: PartnerPairing[] = [];
  for (const [term, value] of Object.entries(byTerm || {})) {
    if (!Array.isArray(value)) continue;
    const bounds = termBoundsOf(term);
    for (const entry of value) {
      const members = uniqIds(
        Array.isArray(entry)
          ? entry
          : Array.isArray((entry as { members?: unknown[] })?.members)
            ? (entry as { members: unknown[] }).members
            : [],
      );
      if (members.length < 2) continue;
      const startDate = bounds?.start ?? today;
      const endDate = term === current ? null : bounds?.end ?? startDate;
      out.push({ id: members.join('+') + '@' + startDate, members, startDate, ...(endDate ? { endDate } : {}) });
    }
  }
  return out;
};

/** Normalise a settings/partners read into dated records: the canonical
 *  `{ pairings: [...] }` shape when present, otherwise the legacy byTerm map
 *  migrated in memory. */
export function pairingsFromSettings(
  raw: { pairings?: unknown; byTerm?: Record<string, unknown> } | undefined | null,
  now: Date = new Date(),
): PartnerPairing[] {
  if (!raw) return [];
  if (Array.isArray(raw.pairings)) return cleanPairings(raw.pairings);
  return migrateByTermToPairings(raw.byTerm, now);
}

/**
 * Every contact whose stored founders disagree with what the dated pairing
 * history implies for its creation time, plus the ones the report cannot
 * verify. Matching contacts and contacts that predate the `founders` field are
 * skipped. Read-only: the report never proposes a write.
 */
export function planContactFounderDrift(
  contacts: readonly FounderDriftContact[],
  pairings: readonly PartnerPairing[],
): FounderDriftRow[] {
  const rows: FounderDriftRow[] = [];
  for (const contact of contacts) {
    if (!Array.isArray(contact.founders)) continue;
    const stored = ids(contact.founders);
    const anchor = contact.createdBy || contact.addedBy || '';
    const day = dayOf(contact.createdAt);

    if (!anchor || !day) {
      rows.push({
        contactId: contact.id,
        anchor,
        createdAt: day || '',
        stored,
        implied: [],
        outcome: 'unverifiable',
        reason: !anchor ? 'no-anchor' : 'no-creation-date',
      });
      continue;
    }

    const implied = impliedFounders(pairings, anchor, day);
    if (sameSet(stored, implied)) continue;
    rows.push({
      contactId: contact.id,
      anchor,
      createdAt: day,
      stored,
      implied,
      outcome: 'drift',
      reason: 'founders-disagree',
    });
  }
  return rows;
}