// Pure "Global Search" logic — MVP scope (People + Quick actions + History;
// Conversations and Coordination Notes are deferred, see MIGRATION.md).
// Shared by mobile (web's version, src/components/layout/GlobalSearch.tsx,
// stays a ⌘K overlay and isn't re-derived from this module). Icon/color
// selection stays out of this module, matching feedback.ts/history.ts's
// convention.
import { hasMinRole, type AppRole } from "./permissions";
import { matchContact, matchTier, type ContactMatch } from "./contactMatch";
import type { Hist } from "./history";
import type { Contact } from "./types";

// Cap per group so the results stay scannable — matches web's GS_MAX.
export const GS_MAX = 4;

export function snippet(text: string, max = 64): string {
  const s = (text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

export function recentPeople(contacts: Contact[], max: number = GS_MAX): Contact[] {
  const key = (c: Contact) => c.updatedAt || c.createdAt || c.lastSeen || "";
  return contacts
    .slice()
    .sort((a, b) => key(b).localeCompare(key(a)))
    .slice(0, max);
}

const personFields = (c: Contact): Array<string | undefined> => [
  c.role,
  c.location,
  c.notes,
  c.spiritualBackground,
  (c.tags ?? []).join(" "),
];

/** Name-first, word-boundary match (#1192): name matches rank above contacts
 *  that only match on role/location/notes/background/tags, and "ian" no longer
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

const matchesHistoryQuery = (a: Hist, q: string): boolean =>
  (a.action || "").toLowerCase().includes(q) ||
  (a.description || "").toLowerCase().includes(q) ||
  (a.target || "").toLowerCase().includes(q);

/** Trainee+ only (mirrors web's `isStaff` gate) — a viewer/operator query
 * always returns no History results, regardless of match. */
export function searchHistory(activities: Hist[], q: string, role: AppRole | string | null, max: number = GS_MAX): Hist[] {
  const needle = q.trim().toLowerCase();
  if (!needle || !hasMinRole(role, "manager")) return [];
  return activities.filter((a) => matchesHistoryQuery(a, needle)).slice(0, max);
}

export type QuickActionKey = "new-contact" | "signup";

export interface QuickAction {
  key: QuickActionKey;
  label: string;
  sub: string;
}

/**
 * Role-filtered quick actions — trimmed from web's 4 to the 2 mobile has a
 * real destination for today: "Log a visit" (no mobile log-interaction flow)
 * and "The Journey" (Board is unstarted Phase 4) are omitted.
 */
export function quickActionsFor(role: AppRole | string | null): QuickAction[] {
  const actions: QuickAction[] = [];
  if (hasMinRole(role, "operator")) {
    actions.push({ key: "new-contact", label: "New contact", sub: "Add a new person" });
  }
  actions.push({ key: "signup", label: "Open sign-up form", sub: "Welcome someone new" });
  return actions;
}
