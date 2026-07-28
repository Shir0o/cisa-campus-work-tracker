// Turning Yjs awareness into the row of faces above a Board page.
//
// Awareness is keyed by Yjs clientID, and a clientID is minted per editor mount —
// so one person with two tabs (or a page they've opened, left and come back to) is
// several clientIDs. The stack is about *who* is here, not how many sockets they
// hold, so collapse to one entry per person and leave yourself out of it.

export interface AwarenessUserState {
  user?: { uid?: string; name?: string; color?: string };
}

export interface Peer {
  /** Stable per person — safe as a React key across clientID churn. */
  key: string;
  name: string;
  color: string;
}

export function peersFromAwareness(
  states: Map<number, AwarenessUserState>,
  selfClientId: number,
  selfUid: string,
): Peer[] {
  const byPerson = new Map<string, Peer>();
  states.forEach((state, clientId) => {
    if (clientId === selfClientId) return;
    const user = state.user;
    if (selfUid && user?.uid === selfUid) return; // your own other tab isn't a peer
    // No uid means a client on the build before uid was published — its name is the
    // best identity available. With neither, keep it separate rather than merging
    // two strangers into one avatar.
    const key = user?.uid || user?.name || String(clientId);
    if (byPerson.has(key)) return;
    byPerson.set(key, { key, name: user?.name || 'Someone', color: user?.color || '#888' });
  });
  return [...byPerson.values()];
}
