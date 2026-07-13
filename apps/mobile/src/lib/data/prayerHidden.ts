// Which contacts a user has "stopped holding" on the Prayer tab — mirrors the
// web app's src/views/PrayerList.tsx (`cisa.prayer.hidden` in localStorage),
// swapping in AsyncStorage per the same async-hydrate-cache pattern as
// ./inboxReads.ts. Hiding someone doesn't delete their prayer records; it just
// removes them from the "people we're holding" list going forward.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const PRAYER_HIDDEN_PREFIX = 'cisa.prayer.hidden.';

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, Set<string>> = {};
const hydrated = new Set<string>();

const keyFor = (uid: string) => PRAYER_HIDDEN_PREFIX + uid;

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

export const PrayerHidden = {
  isHidden: (uid: string, contactId: string): boolean => get(uid).has(contactId),

  hide(uid: string, contactId: string) {
    const set = get(uid);
    if (!set.has(contactId)) {
      set.add(contactId);
      save(uid);
      emit();
    }
  },

  unhide(uid: string, contactId: string) {
    const set = get(uid);
    if (set.has(contactId)) {
      set.delete(contactId);
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

/** Subscribe a component to the hidden-contacts set; re-renders on any change. */
export function usePrayerHidden(): typeof PrayerHidden {
  const [, force] = useState(0);
  useEffect(() => PrayerHidden.subscribe(() => force((n) => n + 1)), []);
  return PrayerHidden;
}
