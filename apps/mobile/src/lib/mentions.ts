// The mobile half of the @mention grammar (ADR 0007): find the active query,
// narrow the roster, and reconcile what was picked against the body as sent.
// A mirror of the web's src/lib/mentions.ts — the two platforms share no
// module, so the same three pure steps live here too.

export interface MentionUser {
  uid: string;
  name: string;
  /** AppRole: 'admin' is a Full-timer. */
  role?: string | null;
}

export interface MentionMatch {
  query: string;
  atIndex: number;
}

/** The active @mention before the cursor, if the text before it ends in an
 *  '@' at the start of a line or after whitespace. */
export function extractMentionCandidate(text: string, cursorPos: number): MentionMatch | null {
  const upToCursor = text.slice(0, cursorPos);
  const atIndex = upToCursor.lastIndexOf('@');
  if (atIndex === -1) return null;
  if (atIndex > 0 && !/\s/.test(upToCursor[atIndex - 1])) return null;
  const query = upToCursor.slice(atIndex + 1);
  if (/\n/.test(query)) return null;
  return { query, atIndex };
}

/** Narrow the roster by the typed query, and to Full-timers only in the
 *  Full-timers stream. */
export function filterMentionCandidates(users: MentionUser[], query: string, isTeamScope: boolean): MentionUser[] {
  const q = query.trim().toLowerCase();
  return users.filter((u) => {
    if (isTeamScope && u.role !== 'admin') return false;
    if (!q) return true;
    return u.name.toLowerCase().includes(q);
  });
}

/** The picked mentions whose '@Name' still appears in the body as sent —
 *  removing the mention before sending drops the notification (ADR 0007). */
export function reconcileMentionedUsers(
  text: string,
  selected: Array<{ uid: string; name: string }>,
): string[] {
  const lower = text.toLowerCase();
  const present: string[] = [];
  for (const user of selected) {
    if (lower.includes(`@${user.name.toLowerCase()}`) && !present.includes(user.uid)) present.push(user.uid);
  }
  return present;
}
