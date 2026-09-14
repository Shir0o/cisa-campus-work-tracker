import type { Contact, Gathering, GatheringAttendance, Rhythm } from '../types';

/** A contact's mark for one occasion. `present` means they were there;
 *  `absent` is only ever set deliberately. */
export type GatheringAttendanceStatus = 'present' | 'absent';

/** The pre-#958 per-Contact map, read only by the migration bridge below. */
type LegacyContactAttendance = Record<string, boolean | 'absent' | 'late'>;

const legacyAttendance = (contact: Contact): LegacyContactAttendance | undefined =>
  (contact as { attendance?: LegacyContactAttendance }).attendance;

const legacyTakenAt = (gathering: Gathering): boolean =>
  Boolean((gathering as { attendanceTakenAt?: string }).attendanceTakenAt);

/** True when attendance has been taken for this occasion, even if nobody came. */
export function isAttendanceTaken(gathering: Gathering): boolean {
  return gathering.attendance !== undefined;
}

/** Determines whether a contact was marked present for a session. */
export function isContactPresent(gathering: Gathering, contactId: string): boolean {
  return gathering.attendance?.present.includes(contactId) ?? false;
}

/** Explicitly marked absent (distinct from merely unmarked). */
export function explicitlyAbsent(gathering: Gathering, contactId: string): boolean {
  return gathering.attendance?.absent.includes(contactId) ?? false;
}

/** How many people were present at this occasion. */
export function presentCount(gathering: Gathering): number {
  return gathering.attendance?.present.length ?? 0;
}

/**
 * Resolves who's on the roster for a Gathering.
 *
 * Rule (issue #957 / ADR 0005 amendment): a Rhythm's roster with the
 * Gathering's `rosterOverride` applied on top. A Gathering dated in the past
 * is FROZEN — it reads back whatever was recorded at the time
 * (`gathering.rosterOverride ?? gathering.roster ?? []`), never the Rhythm's
 * roster as it stands today, so renaming/re-rostering a Rhythm doesn't
 * rewrite history. Today/future Gatherings resolve live from
 * `rhythm.roster` (+ override), so a roster change takes effect immediately
 * for the current and upcoming weeks — this is what retires the "apply to
 * future series?" prompt.
 *
 * A one-off Gathering (no `rhythmId`) has no Rhythm to resolve from, so it
 * always reads its own `roster`.
 */
export function resolveRoster(gathering: Gathering, rhythm: Rhythm | undefined, now: Date): string[] {
  if (!gathering.rhythmId) return gathering.roster ?? [];

  const isPast = isPastDate(gathering.date, now);
  if (isPast) {
    // Frozen: whatever was recorded for this week, never the Rhythm as it
    // stands today. The Rhythm fallback covers occasions created after the
    // migration that passed without ever being recorded.
    return gathering.rosterOverride ?? gathering.roster ?? rhythm?.roster ?? [];
  }

  const base = rhythm?.roster ?? gathering.roster ?? [];
  const override = gathering.rosterOverride;
  if (override === undefined) return base;
  // The override is the full list for this occasion, but it was authored
  // against rosterOverrideBase. Re-apply it as a diff so a later Rhythm
  // roster change still reaches this week (story 5) instead of the override
  // amputating it. Without a recorded base, the current Rhythm roster is the
  // best available snapshot.
  const snapshot = gathering.rosterOverrideBase ?? base;
  const removed = snapshot.filter((id) => override.indexOf(id) === -1);
  const added = override.filter((id) => snapshot.indexOf(id) === -1);
  const resolved = base.filter((id) => removed.indexOf(id) === -1);
  for (const id of added) {
    if (resolved.indexOf(id) === -1) resolved.push(id);
  }
  return resolved;
}

const parseLocalDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function isPastDate(date: string, now: Date): boolean {
  const d = parseLocalDate(date);
  if (!d) return false;
  return d.getTime() < startOfDay(now).getTime();
}


/** Pure state helper: mark a Gathering cancelled. */
export function cancelGathering(gathering: Gathering): Gathering {
  return { ...gathering, cancelled: true };
}

/** Pure state helper: undo a cancellation. */
export function uncancelGathering(gathering: Gathering): Gathering {
  const { cancelled, ...rest } = gathering;
  return rest;
}

/** Tapping a name cycles present -> absent -> present. */
export function cycleAttendanceStatus(
  current: GatheringAttendanceStatus | undefined,
): GatheringAttendanceStatus {
  return current === 'present' ? 'absent' : 'present';
}

/** Applies one contact's new mark, returning a fresh record. */
export function applyAttendance(
  current: GatheringAttendance | undefined,
  contactId: string,
  next: GatheringAttendanceStatus,
): GatheringAttendance {
  const present = (current?.present ?? []).filter((id) => id !== contactId);
  const absent = (current?.absent ?? []).filter((id) => id !== contactId);
  if (next === 'present') present.push(contactId);
  else absent.push(contactId);
  return { present, absent };
}

/** Fills attendance on Gatherings that predate the move, from the legacy
 *  per-Contact maps and the attendance-taken stamps. A no-op once backfilled. */
export function hydrateGatherings(gatherings: Gathering[], contacts: Contact[]): Gathering[] {
  const presentById: Record<string, string[]> = {};
  const absentById: Record<string, string[]> = {};
  const markedById: Record<string, boolean> = {};
  for (const contact of contacts) {
    const map = legacyAttendance(contact);
    if (map === undefined) continue;
    for (const gatheringId of Object.keys(map)) {
      if (markedById[gatheringId] === undefined) {
        markedById[gatheringId] = true;
        presentById[gatheringId] = [];
        absentById[gatheringId] = [];
      }
      const value = map[gatheringId];
      if (value === 'absent') {
        absentById[gatheringId].push(contact.id);
      } else {
        presentById[gatheringId].push(contact.id);
      }
    }
  }
  const out: Gathering[] = [];
  for (const gathering of gatherings) {
    if (gathering.attendance !== undefined) {
      out.push(gathering);
      continue;
    }
    let marked = markedById[gathering.id] === true;
    if (marked === false) {
      marked = legacyTakenAt(gathering);
    }
    if (marked === false) {
      out.push(gathering);
      continue;
    }
    const present = presentById[gathering.id];
    const absent = absentById[gathering.id];
    const next: Gathering = Object.assign({}, gathering);
    next.attendance = { present: present === undefined ? [] : present, absent: absent === undefined ? [] : absent };
    out.push(next);
  }
  return out;
}

/**
 * Segregates contacts for a gathering into:
 * - `present`: Anyone marked present (roster or walk-in).
 * - `absent`: Roster members not marked present, plus anyone
 *   outside the roster explicitly marked absent.
 * - `nonRoster`: Other contacts who did not attend and are not on the roster.
 *
 * A cancelled Gathering counts nobody absent: everyone not marked present
 * falls through to `nonRoster` instead.
 */
export function getSessionRoster(
  event: Gathering,
  contacts: Contact[],
  resolvedRoster?: string[],
): {
  present: Contact[];
  absent: Contact[];
  nonRoster: Contact[];
} {
  const rosterSet = new Set(resolvedRoster ?? event.roster ?? []);
  const present: Contact[] = [];
  const absent: Contact[] = [];
  const nonRoster: Contact[] = [];
  for (const contact of contacts) {
    if (isContactPresent(event, contact.id)) {
      present.push(contact);
    } else if (event.cancelled === true) {
      nonRoster.push(contact);
    } else if (rosterSet.has(contact.id) || explicitlyAbsent(event, contact.id)) {
      absent.push(contact);
    } else {
      nonRoster.push(contact);
    }
  }
  return { present, absent, nonRoster };
}

/**
 * Checks whether a given session counts toward a contact attendance / absence
 * metrics. Per ADR 0005, sessions prior to a contact first attendance or
 * roster inclusion do not count against them as an absence. A cancelled
 * Gathering never counts.
 */
export function shouldCountSessionForContact(
  contact: Contact,
  session: Gathering,
  allSessionsSortedDesc: Gathering[],
  resolvedRosterFor: (s: Gathering) => string[] = (s) => s.roster ?? [],
): boolean {
  if (session.cancelled === true) return false;
  if (isContactPresent(session, contact.id) || explicitlyAbsent(session, contact.id)) return true;
  if (resolvedRosterFor(session).includes(contact.id)) return true;
  const sessionIdx = allSessionsSortedDesc.findIndex((s) => s.id === session.id);
  if (sessionIdx === -1) return false;
  for (let i = sessionIdx; i < allSessionsSortedDesc.length; i++) {
    const olderSession = allSessionsSortedDesc[i];
    if (olderSession.cancelled === true) continue;
    if (resolvedRosterFor(olderSession).includes(contact.id) || isContactPresent(olderSession, contact.id)) {
      return true;
    }
  }
  return false;
}

/**
 * Identifies contacts who used to come or are on regular rosters, but have
 * missed recent gatherings (since >= 2). Random contacts not in rosters or
 * with no history are excluded. Cancelled Gatherings never count.
 */
export function calculateMissedContacts(
  contacts: Contact[],
  sessionsNewestFirst: Gathering[],
  resolvedRosterFor: (s: Gathering) => string[] = (s) => s.roster ?? [],
): { contact: Contact; since: number; lastSeen: Gathering }[] {
  const scannable = sessionsNewestFirst.filter((s) => (s.cancelled ?? false) === false);
  const out: { contact: Contact; since: number; lastSeen: Gathering }[] = [];
  for (const c of contacts) {
    let since = 0;
    let lastSeen: Gathering | null = null;
    let hasRelevantHistory = false;
    for (const s of scannable) {
      if (isContactPresent(s, c.id)) {
        lastSeen = s;
        hasRelevantHistory = true;
        break;
      }
      if (shouldCountSessionForContact(c, s, scannable, resolvedRosterFor)) {
        since++;
        hasRelevantHistory = true;
      }
    }
    if (hasRelevantHistory && lastSeen !== null && since >= 2) {
      out.push({ contact: c, since, lastSeen });
    }
  }
  return out.sort((a, b) => b.since - a.since).slice(0, 4);
}
