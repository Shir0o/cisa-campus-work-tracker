import type { Contact, Gathering, Rhythm } from '../types';

/**
 * Determines whether a contact was marked present for a session.
 */
export function isContactPresent(contact: Contact, eventId: string): boolean {
  return contact.attendance?.[eventId] === true;
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

/**
 * Segregates contacts for a gathering into:
 * - `present`: Anyone marked present (roster or walk-in).
 * - `absent`: Only contacts on the resolved roster who are NOT marked present,
 *   OR anyone outside the roster explicitly marked 'absent'.
 * - `nonRoster`: Other contacts in the organization who did not attend and are not on the roster.
 *
 * A cancelled Gathering counts nobody absent — everyone not marked present
 * falls through to `nonRoster` instead.
 */
export function getSessionRoster(
  event: Gathering,
  contacts: Contact[],
  isPresent: (contact: Contact, eventId: string) => boolean = (c, eventId) => c.attendance?.[eventId] === true,
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
    const status = contact.attendance?.[event.id];
    const isAttending = isPresent(contact, event.id);

    if (isAttending) {
      present.push(contact);
    } else if (!event.cancelled && (rosterSet.has(contact.id) || status === 'absent')) {
      absent.push(contact);
    } else {
      nonRoster.push(contact);
    }
  }

  return { present, absent, nonRoster };
}

/**
 * Checks whether a given session should count toward a contact's attendance / absence metrics.
 * Per ADR 0005, sessions prior to a contact's first attendance or roster inclusion
 * do not count against them as an absence. A cancelled Gathering never counts.
 */
export function shouldCountSessionForContact(
  contact: Contact,
  session: Gathering,
  allSessionsSortedDesc: Gathering[],
  resolvedRosterFor: (s: Gathering) => string[] = (s) => s.roster ?? [],
): boolean {
  if (session.cancelled) return false;

  // If contact was present or explicitly marked absent, it counts
  const status = contact.attendance?.[session.id];
  if (status !== undefined) return true;

  // If contact is explicitly in this session's resolved roster, it counts
  if (resolvedRosterFor(session).includes(contact.id)) return true;

  // Otherwise, check if the contact has ever attended this session or any older session
  // If their very first attendance in history occurred after this session, this session does not count.
  const sessionIdx = allSessionsSortedDesc.findIndex((s) => s.id === session.id);
  if (sessionIdx === -1) return false;

  // Did the contact attend any session at or before this session?
  for (let i = sessionIdx; i < allSessionsSortedDesc.length; i++) {
    const olderSession = allSessionsSortedDesc[i];
    if (olderSession.cancelled) continue;
    if (resolvedRosterFor(olderSession).includes(contact.id) || contact.attendance?.[olderSession.id] === true) {
      return true;
    }
  }

  return false;
}

/**
 * Identifies contacts who used to come or are on regular rosters, but have missed
 * recent gatherings (since >= 2). Random contacts not in rosters or with no history are excluded.
 * Cancelled Gatherings are excluded from the scan entirely (they never happened).
 */
export function calculateMissedContacts(
  contacts: Contact[],
  sessionsNewestFirst: Gathering[],
  resolvedRosterFor: (s: Gathering) => string[] = (s) => s.roster ?? [],
): { contact: Contact; since: number; lastSeen: Gathering }[] {
  const scannable = sessionsNewestFirst.filter((s) => !s.cancelled);
  const out: { contact: Contact; since: number; lastSeen: Gathering }[] = [];

  for (const c of contacts) {
    let since = 0;
    let lastSeen: Gathering | null = null;
    let hasRelevantHistory = false;

    for (const s of scannable) {
      if (isContactPresent(c, s.id)) {
        lastSeen = s;
        hasRelevantHistory = true;
        break;
      }
      if (shouldCountSessionForContact(c, s, scannable, resolvedRosterFor)) {
        since++;
        hasRelevantHistory = true;
      }
    }

    if (hasRelevantHistory && lastSeen && since >= 2) {
      out.push({ contact: c, since, lastSeen });
    }
  }

  return out.sort((a, b) => b.since - a.since).slice(0, 4);
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
