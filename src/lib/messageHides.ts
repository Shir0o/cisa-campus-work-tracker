import { useEffect, useState } from "react";

// Per-user "hide from my view" state for chat messages, localStorage-backed and
// namespaced per uid (cisa.msg.hidden.<uid>), with a small pub/sub so the open
// thread re-renders live. Mirrors the Field Notes design's MessageHides
// (data.jsx): anyone can tidy their own copy of a conversation; nobody else is
// affected, and it can be brought back. This is deliberately client-only —
// hiding is a per-device preference, not shared state.

const MSG_HIDE_PREFIX = "cisa.msg.hidden.";

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, Set<string>> = {};

/** Test-only: drop the in-memory cache so a test can start from a clean slate
 *  (mirrors InboxReads' __resetInboxReadsCache). */
export function __resetMessageHidesCache() {
  for (const k of Object.keys(cache)) delete cache[k];
}

const keyFor = (uid: string) => MSG_HIDE_PREFIX + uid;

const load = (uid: string): Set<string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(uid)) || "null");
    if (Array.isArray(raw)) return new Set(raw as string[]);
  } catch {
    /* ignore malformed/unavailable storage */
  }
  return new Set();
};

const get = (uid: string): Set<string> => (cache[uid] ??= load(uid));

const save = (uid: string) => {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify([...get(uid)]));
  } catch {
    /* ignore quota/unavailable storage */
  }
};

const emit = () =>
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });

export const MessageHides = {
  has(uid: string, messageId: string): boolean {
    return get(uid).has(messageId);
  },

  hide(uid: string, messageId: string) {
    const set = get(uid);
    if (!set.has(messageId)) {
      set.add(messageId);
      save(uid);
      emit();
    }
  },

  unhide(uid: string, messageId: string) {
    const set = get(uid);
    if (set.delete(messageId)) {
      save(uid);
      emit();
    }
  },

  /** Restore one or more hidden messages (or all of them when no ids given). */
  unhideAll(uid: string, messageIds?: string[]) {
    const set = get(uid);
    let changed = false;
    if (!messageIds || messageIds.length === 0) {
      if (set.size > 0) {
        set.clear();
        changed = true;
      }
    } else {
      messageIds.forEach((id) => {
        if (set.delete(id)) changed = true;
      });
    }
    if (changed) {
      save(uid);
      emit();
    }
  },

  subscribe(fn: Listener) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/** React hook: re-renders the caller whenever the hidden set for `uid` moves. */
export function useMessageHides(uid: string | null | undefined) {
  const [, force] = useState(0);
  useEffect(() => MessageHides.subscribe(() => force((n) => n + 1)), []);
  return uid ? MessageHides : null;
}
