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

/** The design's `M2People` `hit()` (views/mobile/screens.jsx) searches more than
 * the desktop directory does — you look someone up by the hall they live in or
 * the one thing you wrote down about them, not only by name. */
const matchesSearch = (c: Contact, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  const fields = [c.name, c.major, c.year, c.location, (c.tags ?? []).join(" "), c.notes];
  return fields.some((v) => (v ?? "").toLowerCase().includes(needle));
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

export interface DirectorySplit {
  /** The people I'm walking with, longest since we talked first. */
  mine: Leader[];
  /** Everyone else on the team's list, alphabetically. */
  rest: Leader[];
}

/**
 * People, the way the v2 screen reads it: two groups rather than one filtered
 * list (the design's `M2People`). Mine come first and in the order that asks
 * something of me — longest since we talked; everyone else is a directory, so
 * it's alphabetical.
 *
 * `personalIds` is `personalContactIdsOf`'s set: the explicit picker choice, or
 * created-by-me. The design's `c.owner === me` has no equivalent here — a
 * Contact carries no owner.
 */
export function splitDirectory(
  contacts: Contact[],
  touches: Touch[],
  personalIds: Set<string>,
  search: string,
  now: number = Date.now(),
): DirectorySplit {
  const touchMap = lastTouchByContact(touches);
  const toLeader = (c: Contact): Leader => {
    const touch = touchMap.get(c.id);
    const ms = touch?.ms ?? parseMs(c.createdAt);
    return {
      contact: c,
      days: ms == null ? Infinity : daysSince(ms, now),
      note: touch?.note || c.notes || "",
    };
  };
  const matched = contacts.filter((c) => matchesSearch(c, search));
  return {
    mine: matched
      .filter((c) => personalIds.has(c.id))
      .map(toLeader)
      .sort((a, b) => b.days - a.days),
    rest: matched
      .filter((c) => !personalIds.has(c.id))
      .map(toLeader)
      .sort((a, b) => a.contact.name.localeCompare(b.contact.name)),
  };
}

/** The four dots the design paints a stage with (`m2StageTone`), as v2 tone
 * keys — the caller resolves the colour through its own room's palette, so a
 * stage looks the same in green, navy, and at night.
 *
 * Keyed by the stage's position, exactly as the Material `toneForStage` is, so
 * a stage keeps its colour across both languages. */
export type StageToneKey = "ask" | "due" | "note" | "pray";

const STAGE_TONES: StageToneKey[] = ["ask", "due", "note", "pray"];

export function stageToneKey(stages: { label: string }[], label?: string): StageToneKey {
  if (!label) return "note";
  const i = stages.findIndex((s) => s.label === label);
  return i < 0 ? "note" : STAGE_TONES[i % STAGE_TONES.length];
}
