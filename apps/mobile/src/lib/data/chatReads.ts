// Per-user, per-room last-read marker for Messages — mirrors the web app's
// localStorage `chat_read_${roomId}` marker in src/views/Messages.tsx,
// swapping in AsyncStorage + a uid prefix (this device may switch between
// e2e test users), same async-hydrate-cache pattern as ./prayerHidden.ts and
// ./inboxReads.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const CHAT_READ_PREFIX = 'cisa.chat.lastRead.';

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, Record<string, number>> = {};
const hydrated = new Set<string>();

const keyFor = (uid: string) => CHAT_READ_PREFIX + uid;

const emit = () =>
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });

const save = (uid: string) => {
  AsyncStorage.setItem(keyFor(uid), JSON.stringify(cache[uid] ?? {})).catch(() => {
    /* ignore unavailable storage */
  });
};

function hydrate(uid: string) {
  if (hydrated.has(uid)) return;
  hydrated.add(uid);
  AsyncStorage.getItem(keyFor(uid))
    .then((raw) => {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        cache[uid] = parsed as Record<string, number>;
        emit();
      }
    })
    .catch(() => {
      /* ignore malformed/unavailable storage */
    });
}

const get = (uid: string): Record<string, number> => {
  hydrate(uid);
  return (cache[uid] ??= {});
};

export const ChatReads = {
  getLastRead: (uid: string, roomId: string): number | null => get(uid)[roomId] ?? null,

  markRead(uid: string, roomId: string, atMs: number = Date.now()) {
    get(uid)[roomId] = atMs;
    save(uid);
    emit();
  },

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/** Subscribe a component to chat read-state; re-renders on any change. */
export function useChatReads(): typeof ChatReads {
  const [, force] = useState(0);
  useEffect(() => ChatReads.subscribe(() => force((n) => n + 1)), []);
  return ChatReads;
}
