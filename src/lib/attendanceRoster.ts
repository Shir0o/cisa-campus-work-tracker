import type { Contact, Event } from '../types';

/**
 * Determines whether a contact was marked present for a session.
 */
export function isContactPresent(contact: Contact, eventId: string): boolean {
  return contact.attendance?.[eventId] === true;
}

/**
 * Segregates contacts for a gathering into:
 * - `present`: Anyone marked present (roster or walk-in).
 * - `absent`: Only contacts in the event's roster who are NOT marked present,
 *   OR anyone outside the roster explicitly marked 'absent'.
 * - `nonRoster`: Other contacts in the organization who did not attend and are not on the roster.
 */
export function getSessionRoster(
  event: Event,
  contacts: Contact[],
  isPresent: (contact: Contact, eventId: string) => boolean = (c, eventId) => c.attendance?.[eventId] === true,
): {
  present: Contact[];
  absent: Contact[];
  nonRoster: Contact[];
} {
  const rosterSet = new Set(event.roster ?? []);
  const present: Contact[] = [];
  const absent: Contact[] = [];
  const nonRoster: Contact[] = [];

  for (const contact of contacts) {
    const status = contact.attendance?.[event.id];
    const isAttending = isPresent(contact, event.id);

    if (isAttending) {
      present.push(contact);
    } else if (rosterSet.has(contact.id) || status === 'absent') {
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
 * do not count against them as an absence.
 */
export function shouldCountSessionForContact(
  contact: Contact,
  session: Event,
  allSessionsSortedDesc: Event[],
): boolean {
  // If contact was present or explicitly marked absent, it counts
  const status = contact.attendance?.[session.id];
  if (status !== undefined) return true;

  // If contact is explicitly in this session's roster, it counts
  if (session.roster?.includes(contact.id)) return true;

  // Otherwise, check if the contact has ever attended this session or any older session
  // If their very first attendance in history occurred after this session, this session does not count.
  const sessionIdx = allSessionsSortedDesc.findIndex((s) => s.id === session.id);
  if (sessionIdx === -1) return false;

  // Did the contact attend any session at or before this session?
  for (let i = sessionIdx; i < allSessionsSortedDesc.length; i++) {
    const olderSession = allSessionsSortedDesc[i];
    if (olderSession.roster?.includes(contact.id) || contact.attendance?.[olderSession.id] === true) {
      return true;
    }
  }

  return false;
}

/**
 * Identifies contacts who used to come or are on regular rosters, but have missed
 * recent gatherings (since >= 2). Random contacts not in rosters or with no history are excluded.
 */
export function calculateMissedContacts(
  contacts: Contact[],
  sessionsNewestFirst: Event[],
): { contact: Contact; since: number; lastSeen: Event }[] {
  const out: { contact: Contact; since: number; lastSeen: Event }[] = [];

  for (const c of contacts) {
    let since = 0;
    let lastSeen: Event | null = null;
    let hasRelevantHistory = false;

    for (const s of sessionsNewestFirst) {
      if (isContactPresent(c, s.id)) {
        lastSeen = s;
        hasRelevantHistory = true;
        break;
      }
      if (shouldCountSessionForContact(c, s, sessionsNewestFirst)) {
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

/**
 * Given an event and all events, finds all events belonging to the same recurring series
 * occurring on or after the current event's date (inclusive of current event).
 */
export function getRecurringSeriesEventIdsToUpdate(
  currentEvent: Event,
  allEvents: Event[],
): string[] {
  const seriesId = currentEvent.parentEventId || (currentEvent.isRecurring ? currentEvent.id : null);
  if (!seriesId) return [currentEvent.id];

  const currentDate = currentEvent.date;

  return allEvents
    .filter((e) => {
      const belongsToSeries = e.id === seriesId || e.parentEventId === seriesId;
      if (!belongsToSeries) return false;
      return e.date >= currentDate;
    })
    .map((e) => e.id);
}
