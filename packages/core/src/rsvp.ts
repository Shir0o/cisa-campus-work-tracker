// Upcoming events — a pure derivation the phone's Gatherings screen reads. It
// outlived the RSVP feature it was written for (cut with the Student and
// Community roles), so the name still says RSVP.
import { DAY_MS, parseMs } from "./myday";
import type { Event } from "./types";

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
