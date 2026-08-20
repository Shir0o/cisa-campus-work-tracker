import { useEffect, useState } from "react";
import { UserEntityState, __resetUserEntityStateCache } from "./userEntityState";

// Per-user "hide from my view" state for chat messages, backed by unified
// UserEntityState (#326).
// Client-only — hiding is a per-device preference, not shared state.

type Listener = () => void;

/** Test-only: drop the in-memory cache so a test can start from a clean slate */
export function __resetMessageHidesCache() {
  __resetUserEntityStateCache();
}

export const MessageHides = {
  has(uid: string, messageId: string): boolean {
    return UserEntityState.isDone(uid, `message:${messageId}`);
  },

  hide(uid: string, messageId: string) {
    UserEntityState.markDone(uid, `message:${messageId}`);
  },

  unhide(uid: string, messageId: string) {
    UserEntityState.markUndone(uid, `message:${messageId}`);
  },

  /** Restore one or more hidden messages (or all of them when no ids given). */
  unhideAll(uid: string, messageIds?: string[]) {
    if (!messageIds || messageIds.length === 0) {
      UserEntityState.clearDone(uid);
    } else {
      UserEntityState.clearDone(
        uid,
        messageIds.map((id) => `message:${id}`),
      );
    }
  },

  subscribe(fn: Listener) {
    return UserEntityState.subscribe(fn);
  },
};

/** React hook: re-renders the caller whenever the hidden set for `uid` moves. */
export function useMessageHides(uid: string | null | undefined) {
  const [, force] = useState(0);
  useEffect(() => MessageHides.subscribe(() => force((n) => n + 1)), []);
  return uid ? MessageHides : null;
}
