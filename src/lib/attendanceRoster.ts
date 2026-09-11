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

/**
 * Assigns series anchor (`parentEventId`) to a list of occurrence items.
 * If isRecurring is true, every occurrence carries `parentEventId` set to the id of the earliest occurrence.
 */
export function assignSeriesAnchor<T extends { id: string; date: string }>(
  occurrences: readonly T[],
  isRecurring: boolean,
): Array<T & { parentEventId?: string }> {
  if (occurrences.length === 0) return [];
  if (!isRecurring) {
    return occurrences.map((occ) => ({ ...occ }));
  }

  // Find the occurrence with the earliest date.
  let earliest = occurrences[0];
  for (let i = 1; i < occurrences.length; i++) {
    if (occurrences[i].date < earliest.date) {
      earliest = occurrences[i];
    }
  }

  const anchorId = earliest.id;
  return occurrences.map((occ) => ({
    ...occ,
    parentEventId: anchorId,
  }));
}

export interface GatheringSeriesBackfillItem {
  id: string;
  name: string;
  date: string;
  isRecurring?: boolean;
  parentEventId?: string;
}

export interface GatheringSeriesBackfillPlanRow {
  id: string;
  parentEventId: string;
}

/**
 * Pure planner for backfilling `parentEventId` for existing recurring Gatherings.
 * Groups recurring gatherings without `parentEventId` by name and weekday,
 * orders each group by date ascending, and assigns the earliest member's id as `parentEventId`.
 */
export function planGatheringSeriesBackfill(
  gatherings: readonly GatheringSeriesBackfillItem[],
): GatheringSeriesBackfillPlanRow[] {
  // Only consider recurring gatherings without an existing parentEventId
  const candidates = gatherings.filter(
    (g) => g.isRecurring === true && !g.parentEventId,
  );

  // Group by trimmed name + weekday
  const groups = new Map<string, GatheringSeriesBackfillItem[]>();
  for (const g of candidates) {
    // Parse weekday from date string YYYY-MM-DD
    const parts = g.date.split('-').map(Number);
    const weekday = !isNaN(parts[0]) && parts.length === 3
      ? new Date(parts[0], parts[1] - 1, parts[2]).getDay()
      : -1;
    const key = `${g.name.trim()}|${weekday}`;
    const group = groups.get(key);
    if (group) {
      group.push(g);
    } else {
      groups.set(key, [g]);
    }
  }

  const result: GatheringSeriesBackfillPlanRow[] = [];
  for (const group of groups.values()) {
    // Sort by date ascending; tie-break by id
    group.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const anchorId = group[0].id;
    for (const item of group) {
      result.push({
        id: item.id,
        parentEventId: anchorId,
      });
    }
  }

  return result;
}

