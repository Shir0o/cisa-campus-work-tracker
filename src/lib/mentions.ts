export interface MentionUser {
  uid: string;
  name: string;
  role?: string | null;
  photoURL?: string | null;
}

export interface MentionMatch {
  query: string;
  atIndex: number;
}

/**
 * Checks if the text before cursor looks like an active @mention query.
 * Matches '@' preceded by start-of-line or whitespace.
 */
export function extractMentionCandidate(
  text: string,
  cursorPos: number,
): MentionMatch | null {
  const upToCursor = text.slice(0, cursorPos);
  const atIndex = upToCursor.lastIndexOf("@");
  if (atIndex === -1) return null;

  // '@' must be at start of string or preceded by whitespace
  if (atIndex > 0 && !/\s/.test(upToCursor[atIndex - 1])) {
    return null;
  }

  const query = upToCursor.slice(atIndex + 1);
  // If there is a newline in between, it's not an active mention
  if (/\n/.test(query)) return null;

  return {
    query,
    atIndex,
  };
}

/**
 * Filter users based on query and scope (in team scope, only admin/full-timers).
 */
export function filterMentionCandidates(
  users: MentionUser[],
  query: string,
  isTeamScope: boolean,
): MentionUser[] {
  const q = query.trim().toLowerCase();
  return users.filter((u) => {
    if (isTeamScope && u.role !== "admin") {
      return false;
    }
    if (!q) return true;
    return u.name.toLowerCase().includes(q);
  });
}

/**
 * Reconciles selected mention objects with the current text body,
 * returning only user IDs whose names still appear with an '@' in the text.
 */
export function reconcileMentionedUsers(
  text: string,
  selected: Array<{ uid: string; name: string }>,
): string[] {
  const lowerText = text.toLowerCase();
  const presentUids = new Set<string>();
  for (const user of selected) {
    const mentionString = `@${user.name.toLowerCase()}`;
    if (lowerText.includes(mentionString)) {
      presentUids.add(user.uid);
    }
  }
  return [...presentUids];
}
