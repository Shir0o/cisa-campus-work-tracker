import { useEffect, useState } from "react";

// Per-user read state for inbox items, localStorage-backed and namespaced per
// uid (cisa.inbox.read.<uid>), with a small pub/sub so My Day + the bell can
// re-render live. Item ids look like contact:<id>, interaction:<id>, thread:<id>.
//
// This is intentionally a client-only, per-device preference (which items a user
// has "scanned") — it is not shared state, so it stays out of Firestore.

const INBOX_READ_PREFIX = "cisa.inbox.read.";

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, Set<string>> = {};

const keyFor = (uid: string) => INBOX_READ_PREFIX + uid;

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

export const InboxReads = {
  isRead: (uid: string, itemId: string): boolean => get(uid).has(itemId),

  markRead(uid: string, itemId: string) {
    const set = get(uid);
    if (!set.has(itemId)) {
      set.add(itemId);
      save(uid);
      emit();
    }
  },

  markUnread(uid: string, itemId: string) {
    const set = get(uid);
    if (set.has(itemId)) {
      set.delete(itemId);
      save(uid);
      emit();
    }
  },

  markAll(uid: string, itemIds: string[]) {
    const set = get(uid);
    let changed = false;
    for (const id of itemIds) {
      if (!set.has(id)) {
        set.add(id);
        changed = true;
      }
    }
    if (changed) {
      save(uid);
      emit();
    }
  },

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
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
  for (const k of Object.keys(cache)) delete cache[k];
};
