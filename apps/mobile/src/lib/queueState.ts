// Mobile v2 — per-day focus-queue state. Ported from the design project's
// `M2Queue` (views/mobile/queue.jsx), swapping localStorage for AsyncStorage the
// same way data/inboxReads.ts does.
//
// Two maps, both keyed by card id: `handled` (dealt with — gone for the day) and
// `later` (pushed to the back, in the order they were deferred). Both reset when
// the date changes, so the queue starts fresh each morning.
//
// This file is storage and pub/sub only — how the two maps CHANGE lives in
// @cisa/core's queueDay.ts, which replaces the state rather than editing it.
// That is load-bearing, not stylistic: useTraineeLandingData derives the card
// order in a `useMemo` keyed on `handled` and `later`, so maps mutated in place
// would re-render the screen without ever recomputing the order.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { emptyQueueDay, queueDayHandle, queueDayLater, type QueueDayState } from '@cisa/core';

const QUEUE_PREFIX = 'cisa.m2.queue.';

type Listener = () => void;

const subs = new Set<Listener>();
const cache: Record<string, QueueDayState> = {};
const hydrated = new Set<string>();

const today = () => new Date().toISOString().slice(0, 10);
const keyFor = (uid: string) => QUEUE_PREFIX + uid;
const fresh = (): QueueDayState => emptyQueueDay(today());
const SIGNED_OUT: QueueDayState = emptyQueueDay('');

const emit = () =>
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });

const save = (uid: string) => {
  AsyncStorage.setItem(keyFor(uid), JSON.stringify(cache[uid])).catch(() => {
    /* ignore unavailable storage */
  });
};

function hydrate(uid: string) {
  if (hydrated.has(uid)) return;
  hydrated.add(uid);
  AsyncStorage.getItem(keyFor(uid))
    .then((raw) => {
      const parsed = raw ? (JSON.parse(raw) as Partial<QueueDayState>) : null;
      if (parsed && parsed.day === today() && parsed.handled && parsed.later) {
        cache[uid] = { day: parsed.day, handled: parsed.handled, later: parsed.later };
        emit();
      }
    })
    .catch(() => {
      /* ignore malformed/unavailable storage */
    });
}

function get(uid: string): QueueDayState {
  hydrate(uid);
  const state = (cache[uid] ??= fresh());
  // A day boundary crossed while the app stayed open: start over.
  if (state.day !== today()) {
    cache[uid] = fresh();
    save(uid);
    return cache[uid];
  }
  return state;
}

export const QueueState = {
  for: (uid: string): QueueDayState => get(uid),

  /** Dealt with — gone from the queue until tomorrow. */
  handle(uid: string, cardId: string) {
    cache[uid] = queueDayHandle(get(uid), cardId, Date.now());
    save(uid);
    emit();
  },

  /** Not now — back of the queue, behind anything deferred earlier. */
  later(uid: string, cardId: string) {
    cache[uid] = queueDayLater(get(uid), cardId, Date.now());
    save(uid);
    emit();
  },

  /** "Bring back today's queue". */
  reset(uid: string) {
    cache[uid] = fresh();
    save(uid);
    emit();
  },

  handledCount: (uid: string): number => Object.keys(get(uid).handled).length,

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/** Subscribe a component to queue state; re-renders on any change. */
export function useQueueState(uid: string | null): {
  handled: Record<string, number>;
  later: Record<string, number>;
  handledCount: number;
  handle: (cardId: string) => void;
  pushLater: (cardId: string) => void;
  reset: () => void;
} {
  const [, force] = useState(0);
  useEffect(() => QueueState.subscribe(() => force((n) => n + 1)), []);

  // One shared empty day while auth resolves — a new object per render would
  // churn the identity the queue's `useMemo` keys on, for no state change.
  const state = uid ? QueueState.for(uid) : SIGNED_OUT;
  return {
    handled: state.handled,
    later: state.later,
    handledCount: Object.keys(state.handled).length,
    handle: (cardId: string) => uid && QueueState.handle(uid, cardId),
    pushLater: (cardId: string) => uid && QueueState.later(uid, cardId),
    reset: () => uid && QueueState.reset(uid),
  };
}
