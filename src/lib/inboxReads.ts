import { useEffect, useState } from "react";
import { UserEntityState, __resetUserEntityStateCache } from "./userEntityState";

// Per-user read state for inbox items, backed by unified UserEntityState (#326).
// Item ids look like contact:<id>, interaction:<id>, thread:<id>.
//
// Client-only, per-device preference (which items a user has "scanned").

type Listener = () => void;

export const InboxReads = {
  isRead(uid: string, itemId: string): boolean {
    return UserEntityState.isRead(uid, itemId);
  },

  markRead(uid: string, itemId: string) {
    UserEntityState.markRead(uid, itemId);
  },

  markUnread(uid: string, itemId: string) {
    UserEntityState.markUnread(uid, itemId);
  },

  markAll(uid: string, itemIds: string[]) {
    UserEntityState.markAllRead(uid, itemIds);
  },

  subscribe(fn: Listener): () => void {
    return UserEntityState.subscribe(fn);
  },
};

/** Subscribe a component to inbox read-state; re-renders on any change. */
export function useInboxReads(): typeof InboxReads {
  const [, force] = useState(0);
  useEffect(() => InboxReads.subscribe(() => force((n) => n + 1)), []);
  return InboxReads;
}

// Exposed for tests that need to reset module state between cases.
export const __resetInboxReadsCache = () => {
  __resetUserEntityStateCache();
};
