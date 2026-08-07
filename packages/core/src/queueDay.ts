// The trainee queue's per-day state: which cards have been dealt with, and
// which have been pushed to the back. `buildQueue` reads both (see queue.ts) —
// this file only owns how the two maps change.
//
// Every reducer REPLACES the state rather than editing it. That is the whole
// contract: the mobile queue derives its card order in a `useMemo` keyed on
// `handled` and `later`, so a map mutated in place re-renders the screen
// without recomputing the order — which is exactly how "Later", swipe-to-defer
// and "I prayed just now" all came to do nothing on screen. The design leans
// the other way and says so in views/mobile/m2.jsx: it rebuilds the queue every
// render "on purpose … so memoising it goes stale immediately". We memoise, so
// the state has to move underneath it.

export interface QueueDayState {
  /** ISO date (YYYY-MM-DD) this state belongs to. */
  day: string;
  /** Cards dealt with today → `{id: timestamp}`. */
  handled: Record<string, number>;
  /** Cards pushed to the end today → `{id: timestamp}`, oldest deferral first. */
  later: Record<string, number>;
}

/** A day with nothing on it yet. */
export function emptyQueueDay(day: string): QueueDayState {
  return { day, handled: {}, later: {} };
}

/** Dealt with — gone from the queue until tomorrow, and no longer deferred. */
export function queueDayHandle(state: QueueDayState, cardId: string, at: number): QueueDayState {
  const { [cardId]: _dropped, ...later } = state.later;
  return {
    day: state.day,
    handled: { ...state.handled, [cardId]: at },
    later,
  };
}

/** Not now — back of the queue, behind anything deferred earlier. Deferring a
 *  card that is already deferred restamps it, so it moves to the back again. */
export function queueDayLater(state: QueueDayState, cardId: string, at: number): QueueDayState {
  return {
    day: state.day,
    handled: state.handled,
    later: { ...state.later, [cardId]: at },
  };
}
