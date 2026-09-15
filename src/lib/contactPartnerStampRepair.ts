/**
 * Pure planner for the re-runnable Gospel Partner stamp repair (issue #1039).
 *
 * The #1024 phase 4 backfill reconciled Gospel Partners: for every contact a
 * Trainee had ever anchored, it wrote that Trainee's *current* partner into
 * `coCreators`. A pairing that exists today is not evidence of collaboration
 * that happened terms ago, so the backfill handed each Trainee their partner's
 * whole back catalogue -- readable, and (per ADR 0022) manageable. This planner
 * decides which of those stamps to take back.
 *
 * It cannot simply ask "were these two paired in this contact's term".
 * `settings/partners` holds one group list per term and rewrites that term's
 * entry in place with no activity-log entry, so a mid-term re-pairing destroys
 * the arrangement that came before it: for the CURRENT term the question has no
 * reliable answer. What survives is the document's own Firestore metadata, and
 * it does most of the sorting:
 *
 *   - before `createTime`  -> remove. There was no arrangement for
 *     `stampPartners` to read at creation, so the tie can only be the
 *     backfill's.
 *   - after `updateTime`   -> keep. The current grouping has certainly been in
 *     place since then, so creation-time stamping accounts for the tie.
 *   - between the two      -> ask. The pair may predate the later edit or have
 *     been created by it, and `updateTime` cannot tell: a write that re-pairs
 *     one group bumps the timestamp for every group in the document.
 *
 * Past terms are different: historical `byTerm` entries are not being
 * rewritten, so the term test is sound there and decides on its own -- but only
 * below the `createTime` bound, because a closed term's entry was itself written
 * no earlier than `createTime` and so cannot vouch for a stamp at creation.
 *
 * Only `remove` is ever written. `ask` rows are reported and grouped by pair,
 * because one answer -- when were these two put together? -- collapses every
 * row in the group. `createdBy`, `addedBy` and `owner` are never candidates, so
 * the repair can only ever narrow a partner stamp.
 *
 * Pure and dependency-free on purpose, like ./contactVisibleToBackfill.ts: the
 * script imports it without pulling the client Firebase SDK into a Node admin
 * process.
 */
import { visibleToOf, type ContactTies } from './contactTies';

export interface RepairContact extends ContactTies {
  id: string;
  visibleTo?: string[] | null;
  /** Client-written creation timestamp; the date every outcome is judged by. */
  createdAt?: string | null;
  /** Client-written update timestamp, for the provenance flag only. */
  updatedAt?: string | null;
  /** The document's Firestore `updateTime` metadata, for the provenance flag. */
  updateTime?: string | null;
}

export interface PartnerArrangement {
  /** `settings/partners`' term key -> groups of uids, normalised. */
  byTerm: Record<string, string[][]>;
  /** The document's Firestore `createTime` metadata. */
  createTime: string;
  /** The document's Firestore `updateTime` metadata. */
  updateTime: string;
  /** The term whose grouping is live (and therefore untrustworthy). */
  currentTerm: string;
}

/** The window the production backfill ran in, for the provenance flag. */
export interface BackfillRunWindow {
  start: string;
  end: string;
}

export type RepairOutcome = 'remove' | 'keep' | 'ask';

export type RepairReason =
  | 'before-arrangement'
  | 'after-last-change'
  | 'undecidable-window'
  | 'past-term-paired'
  | 'past-term-not-paired'
  | 'unknown-created-at';

export interface RepairRow {
  contactId: string;
  /** The term the contact was created in ('' when it carries no date). */
  term: string;
  /** The contact's creator, else its adder — whose partners were stamped. */
  anchor: string;
  /** The `coCreators` uid under review. */
  candidate: string;
  /** The contact's creation date ('' when it carries none). */
  createdAt: string;
  outcome: RepairOutcome;
  reason: RepairReason;
  /**
   * The document's last write looks like the backfill's rather than a
   * person's: its Firestore `updateTime` falls in the run window while its
   * client-written `updatedAt` predates it. Sharpens a human's reading of an
   * `ask` row; never moves a row between outcomes.
   */
  scriptWritten: boolean;
}

export interface RepairWrite {
  id: string;
  /** The `coCreators` entries resolved as `remove`. */
  removeCoCreators: string[];
  /** The `coCreators` list to write. */
  coCreatorsTo: string[];
  visibleToFrom: string[];
  /** The access list recomputed from the surviving ties, same write. */
  visibleToTo: string[];
}

/** One question to the person who arranged the pairs, not a pile of rows. */
export interface AskGroup {
  /** The pair, sorted. */
  members: string[];
  /** How many contacts are in doubt for this pair. */
  contactCount: number;
  /** The earliest and latest creation date in doubt. */
  from: string;
  to: string;
}

export interface RepairPlan {
  rows: RepairRow[];
  writes: RepairWrite[];
  askGroups: AskGroup[];
}

// The term key a date falls in ("Fall 2026"). Mirrors partnersTermKey in
// src/lib/partners.ts, which cannot be imported here: it pulls the client SDK.
const SEASON_BY_MONTH = [
  'Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
  'Summer', 'Fall', 'Fall', 'Fall', 'Fall', 'Fall',
];

export function termKeyOf(d: Date): string {
  return SEASON_BY_MONTH[d.getMonth()] + ' ' + d.getFullYear();
}

const ms = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

const isId = (id: unknown): id is string => typeof id === 'string' && id.length > 0;

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isId) : []);

/**
 * The document's last write looks like the backfill's: Firestore wrote it inside
 * the run window while the client-written `updatedAt` predates the window. The
 * backfill patch touches only `visibleTo`/`coCreators` and never stamps
 * `updatedAt`, so the pair of timestamps disagreeing points at the script.
 */
const looksScriptWritten = (
  contact: RepairContact,
  window: { start: number; end: number } | null,
): boolean => {
  if (!window) return false;
  const wrote = ms(contact.updateTime);
  if (wrote == null || wrote < window.start || wrote > window.end) return false;
  const touched = ms(contact.updatedAt);
  return touched == null || touched < window.start;
};

const partnersOf = (groups: string[][] | undefined, uid: string): string[] => {
  const group = (groups || []).find((g) => g.includes(uid));
  return group ? group.filter((id) => id !== uid) : [];
};

/**
 * Sort every partner stamp into remove / keep / ask, and build the writes for
 * the removals only.
 */
export function planContactPartnerStampRepair(
  contacts: readonly RepairContact[],
  arrangement: PartnerArrangement,
  runWindow?: BackfillRunWindow,
): RepairPlan {
  const createdMs = ms(arrangement.createTime);
  const changedMs = ms(arrangement.updateTime);
  const start = ms(runWindow?.start);
  const end = ms(runWindow?.end);
  const window = start != null && end != null ? { start, end } : null;
  const currentPartners = arrangement.byTerm[arrangement.currentTerm];

  const rows: RepairRow[] = [];
  const writes: RepairWrite[] = [];

  for (const contact of contacts) {
    const anchor = contact.createdBy || contact.addedBy;
    if (!anchor) continue;

    // Only a current partner of the anchor can have been stamped by the
    // backfill. A tie that is also the creator, adder or caregiver stands on
    // its own and is never a candidate.
    const untouchable = new Set(
      [contact.createdBy, contact.addedBy, contact.owner].filter(isId),
    );
    const partners = new Set(partnersOf(currentPartners, anchor));
    const existing = ids(contact.coCreators);
    const candidates = existing.filter((uid) => partners.has(uid) && !untouchable.has(uid));
    if (candidates.length === 0) continue;

    const bornMs = ms(contact.createdAt);
    const term = bornMs == null ? '' : termKeyOf(new Date(bornMs));
    const scriptWritten = looksScriptWritten(contact, window);

    const remove: string[] = [];
    for (const candidate of candidates) {
      let outcome: RepairOutcome;
      let reason: RepairReason;

      if (bornMs == null) {
        outcome = 'ask';
        reason = 'unknown-created-at';
      } else if (createdMs != null && bornMs < createdMs) {
        // Outranks the term test below, and has to: a `byTerm` entry for a term
        // that closed was itself written no earlier than `createTime`, so it
        // cannot corroborate a stamp made when the document did not yet exist.
        outcome = 'remove';
        reason = 'before-arrangement';
      } else if (term !== arrangement.currentTerm) {
        // A term other than the live one: its `byTerm` entry is not being
        // rewritten, so it can be trusted to say whether these two went out
        // together. Keeping a recorded pairing is the point -- the repair must
        // never take back work a Trainee actually did with their partner.
        const paired = partnersOf(arrangement.byTerm[term], anchor).includes(candidate);
        outcome = paired ? 'keep' : 'remove';
        reason = paired ? 'past-term-paired' : 'past-term-not-paired';
      } else if (changedMs != null && bornMs > changedMs) {
        outcome = 'keep';
        reason = 'after-last-change';
      } else {
        outcome = 'ask';
        reason = 'undecidable-window';
      }

      if (outcome === 'remove') remove.push(candidate);
      rows.push({
        contactId: contact.id,
        term,
        createdAt: contact.createdAt || '',
        anchor,
        candidate,
        outcome,
        reason,
        scriptWritten,
      });
    }

    if (remove.length > 0) {
      const coCreatorsTo = existing.filter((uid) => !remove.includes(uid));
      writes.push({
        id: contact.id,
        removeCoCreators: remove,
        coCreatorsTo,
        visibleToFrom: ids(contact.visibleTo),
        visibleToTo: visibleToOf({ ...contact, coCreators: coCreatorsTo }),
      });
    }
  }

  return { rows, writes, askGroups: groupAsks(rows) };
}

/** Collapse the `ask` rows into one question per pair. */
function groupAsks(rows: readonly RepairRow[]): AskGroup[] {
  const byPair = new Map<string, { members: string[]; contactIds: Set<string>; dates: string[] }>();

  for (const row of rows) {
    if (row.outcome !== 'ask') continue;
    const members = [row.anchor, row.candidate].sort();
    const key = members.join('|');
    const group = byPair.get(key) ?? { members, contactIds: new Set<string>(), dates: [] };
    group.contactIds.add(row.contactId);
    if (row.createdAt) group.dates.push(row.createdAt);
    byPair.set(key, group);
  }

  return [...byPair.values()].map((group) => {
    const sorted = [...group.dates].sort();
    return {
      members: group.members,
      contactCount: group.contactIds.size,
      from: sorted[0] ?? '',
      to: sorted[sorted.length - 1] ?? '',
    };
  });
}
