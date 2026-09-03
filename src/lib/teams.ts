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

let TEAM_BY_UID: ReadonlyMap<string, string> = new Map();

/** Replace the roster from a users collection read (`team` field). */
export function applyTeams(users: Array<{ uid: string; team?: string | null }>): void {
  const next = new Map<string, string>();
  for (const u of users) {
    if (u.uid && isKnownTeam(u.team)) next.set(u.uid, u.team as string);
  }
  TEAM_BY_UID = next;
}

/** The team this person is on, or null when they are unassigned. */
export function teamOf(uid?: string | null): string | null {
  return uid ? TEAM_BY_UID.get(uid) ?? null : null;
}

/** Everyone assigned to a team. */
export function uidsOnTeam(teamId: string): string[] {
  const out: string[] = [];
  TEAM_BY_UID.forEach((team, uid) => {
    if (team === teamId) out.push(uid);
  });
  return out;
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
