// Event RSVPs — pure derivations shared by web and mobile, ported from
// src/components/landing/UpcomingEventsRsvp.tsx. The Firestore reads/writes
// live in ./data/rsvp.ts behind an injected db.
import { DAY_MS, parseMs } from "./myday";
import type { Event } from "./types";

// Event RSVPs live under events/{eventId}/rsvps/{uid} — one doc per attendee,
// keyed by uid so a person can RSVP at most once. Un-RSVP deletes the doc.
export interface Rsvp {
  uid: string;
  name: string;
  status: "going";
  createdAt?: unknown;
}

/** Events from "yesterday" onward (a one-day grace period), soonest first,
 * ties broken by `order`, capped to `count`. */
export function upcomingEventsForRsvp(
  events: Event[],
  count: number = 3,
  now: number = Date.now(),
): { ev: Event; ms: number }[] {
  const cutoff = now - DAY_MS;
  return events
    .map((ev) => ({ ev, ms: parseMs(ev.date) }))
    .filter((x): x is { ev: Event; ms: number } => x.ms != null && x.ms >= cutoff)
    .sort((a, b) => a.ms - b.ms || (a.ev.order ?? 0) - (b.ev.order ?? 0))
    .slice(0, count);
}
