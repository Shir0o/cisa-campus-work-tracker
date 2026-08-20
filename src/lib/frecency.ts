import { useEffect, useState } from 'react';

// Macro-style Frecency ranking (crates/frecency):
//   frequency = log2(event_count + 2)
//   recency   = Σ over last 10 events of exp(-0.1 × hours_ago) × weight
//   score     = 0.7 × frequency + 0.3 × recency
//
// weights: open = +2.0, ping = 0.0, close = -1.0
//
// Backed by per-uid localStorage (cisa.frecency.<uid>) with pub/sub reactivity.

export type FrecencyEventType = 'open' | 'close' | 'ping';

export interface FrecencyEvent {
  type: FrecencyEventType;
  timestamp: number;
}

export const EVENT_WEIGHTS: Record<FrecencyEventType, number> = {
  open: 2.0,
  ping: 0.0,
  close: -1.0,
};

export const QUICK_CLOSE_THRESHOLD_MS = 6000;
const MAX_EVENTS_PER_ENTITY = 20;
const FRECENCY_PREFIX = 'cisa.frecency.';

/**
 * Pure frecency scoring function.
 * Evaluates event frequency log-scaled and recency with exponential decay.
 */
export function computeFrecencyScore(
  events: FrecencyEvent[],
  now: number = Date.now(),
): number {
  if (!events || events.length === 0) return 0;

  const frequency = Math.log2(events.length + 2);

  // Recency sum over the most recent 10 events
  const recentEvents = events.slice(-10);
  const HOUR_MS = 60 * 60 * 1000;

  let recency = 0;
  for (const ev of recentEvents) {
    const hoursAgo = Math.max(0, (now - ev.timestamp) / HOUR_MS);
    const weight = EVENT_WEIGHTS[ev.type] ?? 0;
    recency += Math.exp(-0.1 * hoursAgo) * weight;
  }

  return 0.7 * frequency + 0.3 * recency;
}

type Listener = () => void;
const subs = new Set<Listener>();
const cache: Record<string, Record<string, FrecencyEvent[]>> = {};

const keyFor = (uid: string) => FRECENCY_PREFIX + uid;

const load = (uid: string): Record<string, FrecencyEvent[]> => {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(uid)) || 'null');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, FrecencyEvent[]>;
    }
  } catch {
    /* ignore malformed or unavailable storage */
  }
  return {};
};

const getStore = (uid: string): Record<string, FrecencyEvent[]> => {
  if (!uid) return {};
  return (cache[uid] ??= load(uid));
};

const save = (uid: string) => {
  if (!uid) return;
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(getStore(uid)));
  } catch {
    /* ignore quota/storage limits */
  }
};

const emit = () => {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* prevent broken listener from breaking others */
    }
  });
};

export const Frecency = {
  getEvents(uid: string, entityId: string): FrecencyEvent[] {
    if (!uid || !entityId) return [];
    return getStore(uid)[entityId] || [];
  },

  getScore(uid: string, entityId: string, now: number = Date.now()): number {
    const events = this.getEvents(uid, entityId);
    return computeFrecencyScore(events, now);
  },

  getScores(uid: string, now: number = Date.now()): Record<string, number> {
    const store = getStore(uid);
    const res: Record<string, number> = {};
    for (const [id, events] of Object.entries(store)) {
      res[id] = computeFrecencyScore(events, now);
    }
    return res;
  },

  recordEvent(
    uid: string,
    entityId: string,
    type: FrecencyEventType,
    timestamp: number = Date.now(),
  ) {
    if (!uid || !entityId) return;
    const store = getStore(uid);
    const events = store[entityId] || [];
    const updated = [...events, { type, timestamp }].slice(-MAX_EVENTS_PER_ENTITY);
    store[entityId] = updated;
    save(uid);
    emit();
  },

  recordOpen(uid: string, entityId: string, timestamp: number = Date.now()) {
    this.recordEvent(uid, entityId, 'open', timestamp);
  },

  recordClose(uid: string, entityId: string, timestamp: number = Date.now()) {
    this.recordEvent(uid, entityId, 'close', timestamp);
  },

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/**
 * React hook that subscribes to frecency updates.
 */
export function useFrecency(uid?: string): typeof Frecency {
  const [, force] = useState(0);
  useEffect(() => {
    return Frecency.subscribe(() => force((n) => n + 1));
  }, [uid]);
  return Frecency;
}

/**
 * Sorts items by frecency score descending, using an optional tie-breaker if scores are tied.
 */
export function rankByFrecency<T>(
  uid: string,
  items: T[],
  getId: (item: T) => string,
  tieBreaker?: (a: T, b: T) => number,
  now: number = Date.now(),
): T[] {
  if (!uid || items.length <= 1) return items.slice();

  const scores = new Map<string, number>();
  for (const item of items) {
    const id = getId(item);
    scores.set(id, Frecency.getScore(uid, id, now));
  }

  return items.slice().sort((a, b) => {
    const idA = getId(a);
    const idB = getId(b);
    const scoreA = scores.get(idA) || 0;
    const scoreB = scores.get(idB) || 0;

    if (Math.abs(scoreA - scoreB) > 1e-6) {
      return scoreB - scoreA;
    }

    return tieBreaker ? tieBreaker(a, b) : 0;
  });
}

/**
 * Reset module state for test isolation.
 */
export const __resetFrecencyCache = () => {
  for (const k of Object.keys(cache)) {
    delete cache[k];
  }
  subs.clear();
};
