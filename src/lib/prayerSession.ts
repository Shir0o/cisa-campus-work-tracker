import { useEffect, useState } from 'react';

// Pray-together session carry state (#551) — "who have I prayed for today".
//
// Device-local and per-day, exactly like the mobile queue's handled map: there
// is no `prayedBy` on a prayer and no shared "who prayed today" in Firestore,
// and this feature deliberately keeps that. Keyed per user so two staffers
// don't overwrite each other on a shared machine.

const PREFIX = 'cisa.prayer.session.';

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, { day: string; carried: string[] }> = {};

const today = () => new Date().toISOString().slice(0, 10);
const keyFor = (uid: string) => PREFIX + uid;
const fresh = (): { day: string; carried: string[] } => ({ day: today(), carried: [] });

function load(uid: string): { day: string; carried: string[] } {
  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.day === today() && Array.isArray(parsed.carried)) {
        return { day: parsed.day, carried: parsed.carried };
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  return fresh();
}

function get(uid: string): { day: string; carried: string[] } {
  const state = (cache[uid] ??= load(uid));
  // A day boundary crossed while the app stayed open: start over.
  if (state.day !== today()) {
    cache[uid] = fresh();
    save(uid);
  }
  return cache[uid];
}

function save(uid: string) {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(get(uid)));
  } catch {
    /* ignore quota/storage errors */
  }
}

const emit = () =>
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });

export const PrayerSessionStore = {
  carriedToday(uid: string, contactId: string): boolean {
    return get(uid).carried.includes(contactId);
  },

  carriedCount(uid: string): number {
    return get(uid).carried.length;
  },

  /** Mark a person prayed for today (device-local, one-way until tomorrow). */
  carry(uid: string, contactId: string) {
    const state = get(uid);
    if (!state.carried.includes(contactId)) {
      state.carried.push(contactId);
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

/** Subscribe a component to session state; re-renders on any carry. */
export function usePrayerSession(uid: string | null) {
  const [, force] = useState(0);
  useEffect(() => PrayerSessionStore.subscribe(() => force((n) => n + 1)), []);
  return {
    carriedToday: (contactId: string) => !!uid && PrayerSessionStore.carriedToday(uid, contactId),
    carry: (contactId: string) => {
      if (uid) PrayerSessionStore.carry(uid, contactId);
    },
  };
}

/** Test-only cache reset. */
export function __resetPrayerSessionCache() {
  for (const k of Object.keys(cache)) {
    delete cache[k];
  }
}