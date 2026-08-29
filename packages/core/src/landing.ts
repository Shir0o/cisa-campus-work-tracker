// Trainee landing — pure derivations shared by web and mobile, ported from
// src/views/landings/LandingTrainee.tsx. Distinct from directory.ts's
// filterAndSortDirectory: "days since" here comes from the contact's own
// lastSeen/createdAt fields, not the interactions/comments collection-group.
import { daysSince, parseMs, type Leader } from "./myday";
import type { Contact } from "./types";
import type { ThreadMessageWithContact } from "./threads";

/** Your people — the contacts you created or co-created, longest-since-seen first. */
export function traineeMyPeople(
  contacts: Contact[],
  uid: string | null | undefined,
  now: number = Date.now(),
): Leader[] {
  return contacts
    .filter((c) => uid && (c.createdBy === uid || (c.coCreators && c.coCreators.includes(uid))))
    .map((c) => {
      const ms = parseMs(c.lastSeen) ?? parseMs(c.createdAt);
      const days = ms == null ? Infinity : daysSince(ms, now);
      return { contact: c, days, note: c.notes || "" };
    })
    .sort((a, b) => b.days - a.days);
}

/** Contacts the full-timer has weighed in on (any thread reply) — drives the
 * "weighed in" / "awaiting a look" status on each of your people. */
export function weighedInContactIds(
  threads: ThreadMessageWithContact[],
  fullTimerUids: string[] | null,
): Set<string> {
  const set = new Set<string>();
  if (!fullTimerUids || fullTimerUids.length === 0) return set;
  const fts = new Set(fullTimerUids);
  for (const m of threads) if (m.from && fts.has(m.from)) set.add(m.contactId);
  return set;
}
