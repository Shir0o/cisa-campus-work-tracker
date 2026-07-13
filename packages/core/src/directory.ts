// People (Directory) — pure filter/sort for the full contact list, shared by
// web and mobile. Ported from src/views/Directory.tsx's search/stage-filter
// logic; reuses the same last-touch/days-since machinery as myday.ts's
// deriveLeaders (this is that same computation applied to ALL contacts,
// not just the ones personally held).
import { daysSince, lastTouchByContact, parseMs, type Leader, type Touch } from "./myday";
import type { Contact } from "./types";

export interface DirectoryFilters {
  search: string;
  /** A stage id, or "all" for no stage filter. */
  stageId: string;
}

const matchesSearch = (c: Contact, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [c.name, c.major, c.location].some((v) => (v ?? "").toLowerCase().includes(needle));
};

/** All contacts matching the search/stage filters, longest-since-touched
 * first (folks we haven't seen in a while rise to the top). */
export function filterAndSortDirectory(
  contacts: Contact[],
  touches: Touch[],
  filters: DirectoryFilters,
  now: number = Date.now(),
): Leader[] {
  const touchMap = lastTouchByContact(touches);
  return contacts
    .filter((c) => filters.stageId === "all" || c.stage === filters.stageId)
    .filter((c) => matchesSearch(c, filters.search))
    .map((c) => {
      const touch = touchMap.get(c.id);
      const ms = touch?.ms ?? parseMs(c.createdAt);
      const days = ms == null ? Infinity : daysSince(ms, now);
      return { contact: c, days, note: touch?.note || c.notes || "" };
    })
    .sort((a, b) => b.days - a.days);
}
