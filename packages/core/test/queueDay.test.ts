import { describe, it, expect } from 'vitest';
import { emptyQueueDay, queueDayHandle, queueDayLater, type QueueDayState } from '../src/queueDay';

const DAY = '2026-08-07';

describe('emptyQueueDay', () => {
  it('starts a day with nothing handled and nothing deferred', () => {
    expect(emptyQueueDay(DAY)).toEqual({ day: DAY, handled: {}, later: {} });
  });

  it('hands back its own maps, so two days never share one', () => {
    const a = emptyQueueDay(DAY);
    const b = emptyQueueDay(DAY);
    expect(a.handled).not.toBe(b.handled);
    expect(a.later).not.toBe(b.later);
  });
});

// The whole point of these reducers. The mobile queue derives its card order in
// a `useMemo` keyed on `handled` and `later`; when the store mutated those maps
// in place their identity never changed, so the memo never recomputed and
// "Later" (and swipe-to-defer, and "I prayed just now") did nothing on screen.
// See apps/mobile/src/lib/data/inboxReads.ts for the same fix one file over.
describe('queue day state is replaced, never mutated', () => {
  it('queueDayLater returns a new state with a new `later` map', () => {
    const before = emptyQueueDay(DAY);
    const after = queueDayLater(before, 'pray:p1', 100);

    expect(after).not.toBe(before);
    expect(after.later).not.toBe(before.later);
    expect(after.later).toEqual({ 'pray:p1': 100 });
  });

  it('queueDayLater leaves the state it was given untouched', () => {
    const before = emptyQueueDay(DAY);
    queueDayLater(before, 'pray:p1', 100);
    expect(before.later).toEqual({});
  });

  it('queueDayHandle returns a new state with a new `handled` map', () => {
    const before = emptyQueueDay(DAY);
    const after = queueDayHandle(before, 'todo:due', 100);

    expect(after).not.toBe(before);
    expect(after.handled).not.toBe(before.handled);
    expect(after.handled).toEqual({ 'todo:due': 100 });
  });

  it('queueDayHandle leaves the state it was given untouched', () => {
    const before = emptyQueueDay(DAY);
    queueDayHandle(before, 'todo:due', 100);
    expect(before.handled).toEqual({});
  });

  it('gives a new `later` identity on every defer, so repeated Laters keep advancing', () => {
    const first = queueDayLater(emptyQueueDay(DAY), 'a', 100);
    const second = queueDayLater(first, 'b', 200);
    expect(second.later).not.toBe(first.later);
    expect(second.later).toEqual({ a: 100, b: 200 });
  });
});

describe('queueDayHandle', () => {
  it('clears a deferral — a card dealt with is gone, not waiting at the back', () => {
    const deferred = queueDayLater(emptyQueueDay(DAY), 'task:t1', 100);
    const done = queueDayHandle(deferred, 'task:t1', 200);

    expect(done.handled).toEqual({ 'task:t1': 200 });
    expect(done.later).toEqual({});
    // and the state it replaced still says what it said
    expect(deferred.later).toEqual({ 'task:t1': 100 });
  });

  it('keeps other cards deferred', () => {
    const state = queueDayLater(queueDayLater(emptyQueueDay(DAY), 'a', 100), 'b', 200);
    expect(queueDayHandle(state, 'a', 300).later).toEqual({ b: 200 });
  });
});

describe('deferral order', () => {
  it('records when each card was pushed back, so buildQueue can keep that order', () => {
    let s: QueueDayState = emptyQueueDay(DAY);
    s = queueDayLater(s, 'second', 200);
    s = queueDayLater(s, 'first', 100);

    const order = Object.entries(s.later)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    expect(order).toEqual(['first', 'second']);
  });

  it('re-deferring a card moves it to the back of the deferred run', () => {
    let s: QueueDayState = emptyQueueDay(DAY);
    s = queueDayLater(s, 'a', 100);
    s = queueDayLater(s, 'b', 200);
    s = queueDayLater(s, 'a', 300);
    expect(s.later).toEqual({ a: 300, b: 200 });
  });
});
