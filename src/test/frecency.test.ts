import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeFrecencyScore,
  Frecency,
  rankByFrecency,
  __resetFrecencyCache,
  QUICK_CLOSE_THRESHOLD_MS,
  EVENT_WEIGHTS,
  type FrecencyEvent,
} from '../lib/frecency';

describe('computeFrecencyScore (pure scoring function)', () => {
  const HOUR_MS = 60 * 60 * 1000;

  it('returns 0 for empty event array', () => {
    expect(computeFrecencyScore([])).toBe(0);
  });

  it('calculates score correctly for single open event right now', () => {
    const now = 1_000_000_000_000;
    const events: FrecencyEvent[] = [{ type: 'open', timestamp: now }];
    // frequency = log2(1 + 2) = log2(3) ≈ 1.58496
    // recency = exp(-0.1 * 0) * 2.0 = 2.0
    // score = 0.7 * log2(3) + 0.3 * 2.0 ≈ 1.10947 + 0.6 = 1.70947
    const score = computeFrecencyScore(events, now);
    const expectedFreq = Math.log2(3);
    const expectedRec = 2.0;
    const expectedScore = 0.7 * expectedFreq + 0.3 * expectedRec;
    expect(score).toBeCloseTo(expectedScore, 4);
  });

  it('applies exponential decay over hours ago', () => {
    const now = 1_000_000_000_000;
    const eventsNow: FrecencyEvent[] = [{ type: 'open', timestamp: now }];
    const events10hAgo: FrecencyEvent[] = [{ type: 'open', timestamp: now - 10 * HOUR_MS }];

    const scoreNow = computeFrecencyScore(eventsNow, now);
    const score10hAgo = computeFrecencyScore(events10hAgo, now);

    expect(scoreNow).toBeGreaterThan(score10hAgo);

    const decay = Math.exp(-0.1 * 10); // exp(-1) ≈ 0.36788
    const expectedRec10h = decay * EVENT_WEIGHTS.open;
    const expectedScore10h = 0.7 * Math.log2(3) + 0.3 * expectedRec10h;
    expect(score10hAgo).toBeCloseTo(expectedScore10h, 4);
  });

  it('demotes score when an open is immediately followed by a quick close', () => {
    const now = 1_000_000_000_000;
    const openOnly: FrecencyEvent[] = [{ type: 'open', timestamp: now }];
    const openAndQuickClose: FrecencyEvent[] = [
      { type: 'open', timestamp: now - 1000 },
      { type: 'close', timestamp: now },
    ];

    const scoreOpen = computeFrecencyScore(openOnly, now);
    const scoreOpenAndClose = computeFrecencyScore(openAndQuickClose, now);

    // Negative close weight (-1.0) brings the recency sum down from ~2.0 to ~1.0
    // Frequency increases from log2(3) to log2(4)=2, but score drops overall
    expect(scoreOpenAndClose).toBeLessThan(scoreOpen);
  });

  it('evaluates only the most recent 10 events for recency calculation', () => {
    const now = 1_000_000_000_000;
    const oldEvents: FrecencyEvent[] = Array.from({ length: 15 }, (_, i) => ({
      type: 'open' as const,
      timestamp: now - (20 - i) * HOUR_MS,
    }));

    const score = computeFrecencyScore(oldEvents, now);
    // Event count for frequency is total count (15)
    // Recency sum is only for the last 10 events (indices 5 to 14)
    const expectedFreq = Math.log2(15 + 2);
    const last10 = oldEvents.slice(-10);
    const expectedRec = last10.reduce((acc, ev) => {
      const hoursAgo = (now - ev.timestamp) / HOUR_MS;
      return acc + Math.exp(-0.1 * hoursAgo) * EVENT_WEIGHTS[ev.type];
    }, 0);

    expect(score).toBeCloseTo(0.7 * expectedFreq + 0.3 * expectedRec, 4);
  });

  it('handles ping events (0 weight)', () => {
    const now = 1_000_000_000_000;
    const events: FrecencyEvent[] = [{ type: 'ping', timestamp: now }];
    const score = computeFrecencyScore(events, now);
    const expectedFreq = Math.log2(3);
    const expectedRec = 0;
    expect(score).toBeCloseTo(0.7 * expectedFreq + 0.3 * expectedRec, 4);
  });
});

describe('Frecency Store (per-user localStorage + pub/sub)', () => {
  const uid = 'user-123';
  const now = 1_000_000_000_000;

  beforeEach(() => {
    localStorage.clear();
    __resetFrecencyCache();
    vi.restoreAllMocks();
  });

  it('records open events per user and calculates entity score', () => {
    expect(Frecency.getScore(uid, 'c1', now)).toBe(0);

    Frecency.recordOpen(uid, 'c1', now);

    const score = Frecency.getScore(uid, 'c1', now);
    expect(score).toBeGreaterThan(0);

    // Another user has independent score
    expect(Frecency.getScore('user-456', 'c1', now)).toBe(0);
  });

  it('notifies subscribers when events are recorded', () => {
    const listener = vi.fn();
    const unsub = Frecency.subscribe(listener);

    Frecency.recordOpen(uid, 'c1', now);
    expect(listener).toHaveBeenCalledTimes(1);

    Frecency.recordClose(uid, 'c1', now + 1000);
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    Frecency.recordOpen(uid, 'c2', now);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('records quick close and applies demotion', () => {
    Frecency.recordOpen(uid, 'c1', now);
    const scoreBeforeClose = Frecency.getScore(uid, 'c1', now + 1000);

    Frecency.recordClose(uid, 'c1', now + 1000);
    const scoreAfterClose = Frecency.getScore(uid, 'c1', now + 1000);

    expect(scoreAfterClose).toBeLessThan(scoreBeforeClose);
  });

  it('ignores recording if uid or entityId is missing', () => {
    const listener = vi.fn();
    Frecency.subscribe(listener);

    Frecency.recordOpen('', 'c1', now);
    Frecency.recordOpen(uid, '', now);
    expect(listener).not.toHaveBeenCalled();
  });

  it('limits stored event history per entity to avoid unbounded storage', () => {
    for (let i = 0; i < 30; i++) {
      Frecency.recordOpen(uid, 'c1', now + i * 1000);
    }
    const events = Frecency.getEvents(uid, 'c1');
    expect(events.length).toBeLessThanOrEqual(20);
  });

  it('handles malformed localStorage gracefully', () => {
    localStorage.setItem('cisa.frecency.' + uid, 'invalid json{');
    expect(Frecency.getScore(uid, 'c1', now)).toBe(0);

    // Still allows writing without crashing
    Frecency.recordOpen(uid, 'c1', now);
    expect(Frecency.getScore(uid, 'c1', now)).toBeGreaterThan(0);
  });

  it('rankByFrecency orders items by score descending and breaks ties', () => {
    // c1 opened 3 times
    Frecency.recordOpen(uid, 'c1', now);
    Frecency.recordOpen(uid, 'c1', now + 1000);
    Frecency.recordOpen(uid, 'c1', now + 2000);

    // c2 opened once
    Frecency.recordOpen(uid, 'c2', now);

    // c3 never opened
    const items = [
      { id: 'c3', name: 'Charlie', date: '2026-06-01' },
      { id: 'c2', name: 'Bob', date: '2026-06-02' },
      { id: 'c1', name: 'Alice', date: '2026-06-03' },
    ];

    const ranked = rankByFrecency(
      uid,
      items,
      (item) => item.id,
      (a, b) => b.date.localeCompare(a.date),
      now + 3000,
    );

    expect(ranked.map((r) => r.id)).toEqual(['c1', 'c2', 'c3']);
  });
});
