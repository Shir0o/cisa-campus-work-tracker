import { useEffect, useState } from 'react';

// Session 7 — "What the app is costing people" (#370).
//
// This is intentionally a small, local-first instrument, not analytics
// plumbing. It records only anonymous action shapes:
//   - a screen was opened
//   - a search was run and whether it ended without opening anything
//   - something was created (currently contact and interaction; the same shape
//     can be used for prayer, to-do, and visit creates later)
// It does not store search text, contact names, notes, or who the actor is
// beyond the role label needed to understand the work.
//
// Events are kept per device in localStorage, namespaced per user, capped so
// the store cannot grow without bound. Only the owner's Settings view reads
// these readings; other users never see this surface.

export type UsageEventType = 'screen' | 'search' | 'create' | 'done';

export interface UsageEvent {
  id: string;
  type: UsageEventType;
  /** The route path where the event happened, e.g. `/directory`. */
  path: string;
  createdAt: number;
  /** Coarse role label (`admin`, `manager`, ...). Optional for privacy. */
  role?: string;
  /** Type-specific detail, never user content: create kind or search outcome. */
  meta?: string;
}

const STORAGE_PREFIX = 'cisa.usage.v1.';
const MAX_EVENTS = 2000;
const DEAD_END_MS = 4_000;
const LONG_WALK_WINDOW_MS = 10 * 60_000;

type Listener = () => void;
const listeners = new Set<Listener>();
const cache: Record<string, UsageEvent[]> = {};

const keyFor = (uid: string) => STORAGE_PREFIX + uid;

const load = (uid: string): UsageEvent[] => {
  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((e): e is UsageEvent => e && typeof e === 'object' && typeof e.path === 'string')
          .slice(-MAX_EVENTS);
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  return [];
};

const get = (uid: string): UsageEvent[] => {
  if (!cache[uid]) cache[uid] = load(uid);
  return cache[uid];
};

const persist = (uid: string) => {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(get(uid).slice(-MAX_EVENTS)));
  } catch {
    /* ignore quota/storage errors */
  }
};

const emit = () => {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener should not stop others */
    }
  });
};

export const UsageStats = {
  getEvents(uid: string): UsageEvent[] {
    return get(uid);
  },

  record(
    uid: string,
    event: Omit<UsageEvent, 'id' | 'createdAt'> & { createdAt?: number },
  ) {
    if (!uid) return;
    const createdAt = event.createdAt ?? Date.now();
    const id = `${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const full: UsageEvent = {
      id,
      type: event.type,
      path: event.path || '/',
      createdAt,
      role: event.role,
      meta: event.meta,
    };
    const events = get(uid);
    events.push(full);
    if (events.length > MAX_EVENTS) {
      cache[uid] = events.slice(-MAX_EVENTS);
    }
    persist(uid);
    emit();
  },

  clear(uid: string) {
    cache[uid] = [];
    persist(uid);
    emit();
  },

  subscribe(uid: string, cb: () => void): () => void {
    const listener = () => cb();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useUsageEvents(uid: string | undefined): UsageEvent[] {
  const [events, setEvents] = useState<UsageEvent[]>(() =>
    uid ? UsageStats.getEvents(uid) : [],
  );

  useEffect(() => {
    if (!uid) {
      setEvents([]);
      return;
    }
    setEvents(UsageStats.getEvents(uid));
    return UsageStats.subscribe(uid, () => setEvents(UsageStats.getEvents(uid)));
  }, [uid]);

  return events;
}

export interface DeadEndReading {
  path: string;
  count: number;
}

export interface LongWalkReading {
  from: string;
  created: string;
  count: number;
}

export interface SlowFindReading {
  path: string;
  count: number;
}

export interface UsageReadings {
  screens: number;
  searches: number;
  creates: number;
  deadEnds: DeadEndReading[];
  longWalks: LongWalkReading[];
  slowFinds: SlowFindReading[];
}

export function usageReadings(events: UsageEvent[]): UsageReadings {
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);

  const screens = sorted.filter((e) => e.type === 'screen');
  const searches = sorted.filter((e) => e.type === 'search');
  const creates = sorted.filter((e) => e.type === 'create');

  // A "dead end" is a screen that was left within four seconds for another
  // screen. This is deliberately coarse; it is enough to spot screens that
  // people open and immediately abandon.
  const deadEndCounts = new Map<string, number>();
  for (let i = 0; i < screens.length; i++) {
    const current = screens[i];
    const next = screens.find((s, j) => j > i && s.path !== current.path);
    if (next && next.createdAt - current.createdAt < DEAD_END_MS) {
      deadEndCounts.set(current.path, (deadEndCounts.get(current.path) ?? 0) + 1);
    }
  }

  // A "long walk" is the path that led to a creation: the last screen opened
  // before the create event, within a generous window. This tells us where
  // people have to work to record the things the app exists to record.
  const longWalkCounts = new Map<string, LongWalkReading>();
  for (const create of creates) {
    const before = screens
      .filter((s) => s.createdAt <= create.createdAt && create.createdAt - s.createdAt < LONG_WALK_WINDOW_MS)
      .pop();
    const from = before?.path || '(direct / external)';
    const key = `${from}→${create.meta || 'item'}`;
    const existing = longWalkCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      longWalkCounts.set(key, {
        from,
        created: create.meta || 'item',
        count: 1,
      });
    }
  }

  // A "slow find" is a search that ended without opening anything. The search
  // event stores only `abandoned` / `resolved`, never the query.
  const slowFindCounts = new Map<string, number>();
  for (const search of searches) {
    if (search.meta === 'abandoned') {
      slowFindCounts.set(search.path, (slowFindCounts.get(search.path) ?? 0) + 1);
    }
  }

  const topLongWalks = [...longWalkCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const deadEnds = [...deadEndCounts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const slowFinds = [...slowFindCounts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    screens: screens.length,
    searches: searches.length,
    creates: creates.length,
    deadEnds,
    longWalks: topLongWalks,
    slowFinds,
  };
}

/** Human label for a route path, used only in the owner-only readings panel. */
export function usagePathLabel(path: string): string {
  const map: Record<string, string> = {
    '/': 'Home / My Day',
    '/attendance': 'Gatherings',
    '/outreach': 'Gospel',
    '/board': 'The Journey',
    '/directory': 'People',
    '/history': 'History',
    '/visits': 'Visits',
    '/prayer': 'On our hearts',
    '/answered': 'Answered',
    '/settings': 'Settings',
    '/messages': 'Messages',
    '/feedback': 'Leave a note',
    '/coordination': 'Coordination Notes',
    '/coordination/trash': 'Coordination Trash',
  };
  return map[path] || path || 'Unknown';
}
