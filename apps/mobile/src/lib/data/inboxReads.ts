// Per-user read state for "From the team" inbox items — mirrors the web app's
// src/lib/inboxReads.ts, swapping localStorage for AsyncStorage (async, so a
// uid's cache is hydrated once in the background and listeners are notified
// when it resolves).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const INBOX_READ_PREFIX = 'cisa.inbox.read.';

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, Set<string>> = {};
const hydrated = new Set<string>();

const keyFor = (uid: string) => INBOX_READ_PREFIX + uid;

const emit = () =>
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });

const save = (uid: string) => {
  AsyncStorage.setItem(keyFor(uid), JSON.stringify([...(cache[uid] ?? new Set())])).catch(() => {
    /* ignore unavailable storage */
  });
};

function hydrate(uid: string) {
  if (hydrated.has(uid)) return;
  hydrated.add(uid);
  AsyncStorage.getItem(keyFor(uid))
    .then((raw) => {
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        cache[uid] = new Set(parsed as string[]);
        emit();
      }
    })
    .catch(() => {
      /* ignore malformed/unavailable storage */
    });
}

const get = (uid: string): Set<string> => {
  hydrate(uid);
  return (cache[uid] ??= new Set());
};

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
