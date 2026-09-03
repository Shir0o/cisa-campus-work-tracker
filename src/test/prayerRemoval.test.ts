// Session-scoped pending-removal registry for prayers (#706).
//
// Same two-beat gesture as interactionRemoval: the prayer row leaves the UI
// the moment the user taps Clear, but the Firestore deleteDoc only commits
// after a short Undo window. The pending commit lives at module scope so
// closing the page or navigating away does not cancel it — only an explicit
// Undo does.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  schedulePrayerRemoval,
  cancelPrayerRemoval,
  getPendingPrayerRemovalIds,
  subscribePrayerRemovals,
  PRAYER_REMOVAL_WINDOW_MS,
} from '../lib/prayerRemoval';

describe('prayerRemoval registry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the id while pending and commits once after the window', () => {
    const commit = vi.fn();
    schedulePrayerRemoval('prayer-1', commit);

    expect(getPendingPrayerRemovalIds()).toEqual(['prayer-1']);
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PRAYER_REMOVAL_WINDOW_MS);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(getPendingPrayerRemovalIds()).toEqual([]);
  });

  it('does not commit before the window expires', () => {
    const commit = vi.fn();
    schedulePrayerRemoval('prayer-1', commit);
    vi.advanceTimersByTime(PRAYER_REMOVAL_WINDOW_MS - 1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel clears the id and never commits', () => {
    const commit = vi.fn();
    schedulePrayerRemoval('prayer-1', commit);

    cancelPrayerRemoval('prayer-1');

    expect(getPendingPrayerRemovalIds()).toEqual([]);
    vi.advanceTimersByTime(PRAYER_REMOVAL_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancelling an unknown id is a no-op', () => {
    expect(() => cancelPrayerRemoval('never-scheduled')).not.toThrow();
  });

  it('notifies subscribers on schedule, cancel and commit', () => {
    const cb = vi.fn();
    const unsub = subscribePrayerRemovals(cb);

    schedulePrayerRemoval('prayer-1', vi.fn());
    expect(cb).toHaveBeenCalledTimes(1);

    cancelPrayerRemoval('prayer-1');
    expect(cb).toHaveBeenCalledTimes(2);

    schedulePrayerRemoval('prayer-1', vi.fn());
    vi.advanceTimersByTime(PRAYER_REMOVAL_WINDOW_MS);
    expect(cb).toHaveBeenCalledTimes(4);

    unsub();
    schedulePrayerRemoval('prayer-2', vi.fn());
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('re-scheduling the same id replaces the pending commit', () => {
    const first = vi.fn();
    const second = vi.fn();
    schedulePrayerRemoval('prayer-1', first);
    schedulePrayerRemoval('prayer-1', second);

    vi.advanceTimersByTime(PRAYER_REMOVAL_WINDOW_MS);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('independent ids commit on their own timers', () => {
    const a = vi.fn();
    const b = vi.fn();
    schedulePrayerRemoval('prayer-a', a);
    schedulePrayerRemoval('prayer-b', b);

    cancelPrayerRemoval('prayer-a');
    vi.advanceTimersByTime(PRAYER_REMOVAL_WINDOW_MS);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});