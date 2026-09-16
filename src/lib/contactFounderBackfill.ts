/**
 * Pure planner for the re-runnable founders migration (issue #1050).
 *
 * Every contact that predates #1049 carries no `founders` list. This planner
 * derives each one from the pairing history at its creation time and proposes
 * the writes that stamp it — the committed counterpart to the read-only drift
 * report in ./contactFounderDrift.ts, and the backfill of the founding-set
 * rule #1044 establishes (whoever logged the person, plus everyone they were
 * partnered with at that instant).
 *
 * The pairing history answers most contacts cleanly. For a contact created in a
 * term whose `byTerm` arrangement survives untouched, `impliedFounders` against
 * the dated records says it exactly: inside a recorded pairing -> the creator
 * plus the partner; outside any pairing -> the creator alone. A contact created
 * in the LIVE term is different: a mid-term re-pairing rewrote that term's
 * `byTerm` entry in place and destroyed the arrangement that preceded it, so the
 * settings document cannot say who was live when that contact was made (#1039).
 * Those contacts are resolved ONLY from the pairing-start dates a Full-timer
 * supplied in #1039's question pass — and a current-term contact the supplied
 * answers do not place is LISTED as unresolved rather than guessed, because a
 * wrong founder here is a permanent, un-removable tie.
 *
 * Only resolved contacts produce a write, and each write recomputes `visibleTo`
 * from the surviving ties in the same operation (#1044: the access list and the
 * founders it mirrors must not be left disagreeing). The planner is idempotent:
 * a contact that already carries `founders` is skipped, so re-running after a
 * partial run finishes the job rather than restarting it.
 *
 * Pure and dependency-free on purpose, like the drift planner: the migration
 * script imports it without pulling the client Firebase SDK into a Node admin
 * process.
 */
import type { PartnerPairing } from './partners';
import { impliedFounders } from './contactFounderDrift';
import { termKeyOf } from './contactPartnerStampRepair';
import { visibleToOf } from './contactTies';

export type { PartnerPairing };

export interface FounderBackfillContact {
  id: string;
  createdBy?: string | null;
  addedBy?: string | null;
  founders?: string[] | null;
  visibleTo?: string[] | null;
  coCreators?: string[] | null;
  owner?: string | null;
  createdAt?: string | null;
}

/** A pairing-start answer from #1039's question pass: these two went out
 *  together from this day. Authoritative for the live term, whose byTerm entry
 *  a mid-term re-pairing may have destroyed. */
export interface SuppliedPairing {
  members: string[];
  startDate: string;
}

export type FounderBackfillOutcome = 'resolved' | 'unresolved';

export type FounderBackfillReason =
  | 'no-anchor'
  | 'no-creation-date'
  | 'current-term-paired'
  | 'current-term-unresolved'
  | 'past-term-paired'
  | 'past-term-alone';

export interface FounderBackfillRow {
  contactId: string;
  /** The contact's creator, else its adder — the person who founded it. */
  anchor: string;
  /** The contact's creation day ('' when it carries no usable date). */
  createdAt: string;
  /** The founders the migration would write ([] when unresolved). */
  founders: string[];
  outcome: FounderBackfillOutcome;
  reason: FounderBackfillReason;
}

export interface FounderBackfillWrite {
  id: string;
  /** The founders list to write. */
  foundersTo: string[];
  /** The access list read back (empty when the field is absent). */
  visibleToFrom: string[];
  /** The access list recomputed from the surviving ties, same write. */
  visibleToTo: string[];
}

export interface FounderBackfillPlan {
  rows: FounderBackfillRow[];
  writes: FounderBackfillWrite[];
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD day as a local Date, for the term-key test. */
const dateFromDay = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const uniqIds = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string' && id.length > 0).filter((id, i, a) => a.indexOf(id) === i)
    : [];

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : []);

/** Normalise the #1039 answers into dated records the oracle can read. Records
 *  with fewer than two members or an unusable date are dropped. */
const suppliedToPairings = (raw: readonly SuppliedPairing[]): PartnerPairing[] => {
  const out: PartnerPairing[] = [];
  for (const s of raw || []) {
    const members = uniqIds(s?.members);
    if (members.length < 2 || typeof s?.startDate !== 'string' || !DATE_RE.test(s.startDate)) continue;
    out.push({
      id: members.join('+') + '@' + s.startDate,
      members,
      startDate: s.startDate,
    });
  }
  return out;
};

/**
 * Build the list of contacts that need a founders write, plus the ones the
 * migration cannot resolve. Contacts already carrying `founders` are skipped.
 */
export function planContactFounderBackfill(
  contacts: readonly FounderBackfillContact[],
  pairings: readonly PartnerPairing[],
  suppliedPairings: readonly SuppliedPairing[],
  now: Date = new Date(),
): FounderBackfillPlan {
  const currentTerm = termKeyOf(now);
  const supplied = suppliedToPairings(suppliedPairings);

  const rows: FounderBackfillRow[] = [];
  const writes: FounderBackfillWrite[] = [];

  for (const contact of contacts) {
    if (Array.isArray(contact.founders)) continue;

    const anchor = contact.createdBy || contact.addedBy || '';
    const day = dayOf(contact.createdAt);

    if (!anchor) {
      rows.push({ contactId: contact.id, anchor, createdAt: day || '', founders: [], outcome: 'unresolved', reason: 'no-anchor' });
      continue;
    }
    if (!day) {
      rows.push({ contactId: contact.id, anchor, createdAt: '', founders: [], outcome: 'unresolved', reason: 'no-creation-date' });
      continue;
    }

    const inCurrentTerm = termKeyOf(dateFromDay(day)) === currentTerm;

    let founders: string[];
    let reason: FounderBackfillReason;
    if (inCurrentTerm) {
      // The live term's byTerm entry may have been destroyed by a mid-term
      // re-pairing, so only the Full-timer's supplied start dates may decide.
      // An anchor the answers do not place is listed, never guessed.
      const partners = impliedFounders(supplied, anchor, day).slice(1);
      if (partners.length === 0) {
        rows.push({ contactId: contact.id, anchor, createdAt: day, founders: [], outcome: 'unresolved', reason: 'current-term-unresolved' });
        continue;
      }
      founders = [anchor, ...partners];
      reason = 'current-term-paired';
    } else {
      const implied = impliedFounders(pairings, anchor, day);
      founders = implied;
      reason = implied.length > 1 ? 'past-term-paired' : 'past-term-alone';
    }

    rows.push({ contactId: contact.id, anchor, createdAt: day, founders, outcome: 'resolved', reason });
    writes.push({
      id: contact.id,
      foundersTo: founders,
      visibleToFrom: ids(contact.visibleTo),
      visibleToTo: visibleToOf({ ...contact, founders }),
    });
  }

  return { rows, writes };
}