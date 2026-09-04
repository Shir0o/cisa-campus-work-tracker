// Teams — the division above the pairs (issue #727). Six trainees on YP, six on
// Campus, numbers vary by term. A team is a field on the TRAINEE, never on the
// pair: pairs stay independent and can in principle straddle two teams, and the
// news feed reads the person's team when it filters.
//
// Mirrors the shape of `partners.ts`, but the storage is different on purpose:
// partners live in one team-wide `settings/partners` doc, while a team is one
// field on the user document (`users/{uid}.team`) — the cheapest thing that
// answers "which team is this person on" wherever a uid is already in hand.
//
// A module-level roster (fed by App's RosterSync from the same users
// subscription that feeds `walking.ts`) keeps `teamOf` synchronously readable,
// so the pure feed helpers stay testable and need no prop plumbing.
import { doc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";

export interface Team {
  id: string;
  /** English default; the UI translates through `teamLabelKey`. */
  label: string;
}

/** The teams, in the order their chips appear on the feed.
 *
 *  Two, because two is what the campus runs today — but nothing reads this as a
 *  pair. A third team is one entry here: the chip row wraps, the Settings list
 *  grows, and the filter needs no other change. */
export const TEAMS: readonly Team[] = [
  { id: "yp", label: "YP team" },
  { id: "campus", label: "Campus team" },
];

/** The i18n key carrying a team's name. */
export function teamLabelKey(teamId: string): string {
  return `teams.${teamId}`;
}

/** True when `id` is one of ours — a user document's `team` is never trusted
 *  further than this, so a stale or hand-edited value reads as unassigned. */
export function isKnownTeam(id?: string | null): boolean {
  return !!id && TEAMS.some((t) => t.id === id);
}

// ── module-level roster ─────────────────────────────────────────────────────
//
// Names travel with the team because the feed's own name map is built from
// activity (contacts, interactions, threads), so it cannot name a teammate who
// has done nothing this week — and that teammate is exactly the one the "nothing
// from them" state exists for. The users subscription in App's RosterSync
// already has both fields; carrying the name costs nothing extra.

export interface TeamMember {
  uid: string;
  team: string;
  name: string;
}

let ROSTER: readonly TeamMember[] = [];
let TEAM_BY_UID: ReadonlyMap<string, string> = new Map();

/** Replace the roster from a users collection read (`team` + `displayName`). */
export function applyTeams(
  users: Array<{ uid: string; team?: string | null; displayName?: string | null }>,
): void {
  const roster: TeamMember[] = [];
  const byUid = new Map<string, string>();
  for (const u of users) {
    if (!u.uid || !isKnownTeam(u.team)) continue;
    const team = u.team as string;
    byUid.set(u.uid, team);
    roster.push({ uid: u.uid, team, name: u.displayName?.trim() || "" });
  }
  ROSTER = roster;
  TEAM_BY_UID = byUid;
}

/** The team this person is on, or null when they are unassigned. */
export function teamOf(uid?: string | null): string | null {
  return uid ? TEAM_BY_UID.get(uid) ?? null : null;
}

/** Everyone assigned to a team. */
export function uidsOnTeam(teamId: string): string[] {
  return ROSTER.filter((m) => m.team === teamId).map((m) => m.uid);
}

/** The people the teammate select offers: a team's roster, or everyone on any
 *  team when no team is chosen. Members whose name we never learned are left
 *  out — an option reading "Someone" is worse than one fewer option. */
export function rosterOnTeam(teamId?: string | null): TeamMember[] {
  return ROSTER.filter((m) => (!teamId || m.team === teamId) && !!m.name);
}

// ── Firestore ───────────────────────────────────────────────────────────────

/** Put one person on a team, or take them off it with `null`. Admin-only by
 *  the rules; the write is a single field on their user document. */
export async function saveUserTeam(uid: string, teamId: string | null): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), { team: isKnownTeam(teamId) ? teamId : null });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `users/${uid} team`);
  }
}
