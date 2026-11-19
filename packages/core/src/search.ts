// Pure "Global Search" logic — people only (cut-or-keep §27). One person's
// name, or what is written on their page, and the recent people list.
// Shared by mobile; web's version, src/components/layout/GlobalSearch.tsx,
// stays a ⌘K overlay and isn't re-derived from this module. Icon/color
// selection stays out of this module, matching feedback.ts/history.ts's
// convention.
import { matchContact, matchTier, type ContactMatch } from "./contactMatch";
import type { Contact } from "./types";

// Cap so the results stay scannable — matches web's GS_MAX.
export const GS_MAX = 4;

export function recentPeople(contacts: Contact[], max: number = GS_MAX): Contact[] {
  const key = (c: Contact) => c.updatedAt || c.createdAt || c.lastSeen || "";
  return contacts
    .slice()
    .sort((a, b) => key(b).localeCompare(key(a)))
    .slice(0, max);
}

const personFields = (c: Contact): Array<string | undefined> => [
  c.location,
  c.notes,
  c.spiritualBackground,
  (c.tags ?? []).join(" "),
];

/** Name-first, word-boundary match (#1192): name matches rank above contacts
 *  that only match on location/notes/background/tags, and "ian" no longer
 *  matches "Christian" mid-word. */
export function searchPeople(contacts: Contact[], q: string, max: number = GS_MAX): Contact[] {
  const needle = q.trim();
  if (!needle) return [];
  const scored: { c: Contact; match: ContactMatch }[] = [];
  for (const c of contacts) {
    const m = matchContact(c, needle, personFields(c));
    if (m) scored.push({ c, match: m });
  }
  // Stable by construction (matches scanned in list order); name matches win,
  // then the first `max` results — so a name lookup fills the cap first.
  scored.sort((a, b) => matchTier(a.match) - matchTier(b.match));
  return scored.slice(0, max).map((s) => s.c);
}
