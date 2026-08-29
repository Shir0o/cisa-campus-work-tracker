import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scheduleInteractionRemoval,
  cancelInteractionRemoval,
  getPendingRemovalIds,
  subscribeInteractionRemovals,
  INTERACTION_REMOVAL_WINDOW_MS,
} from '../lib/interactionRemoval';

describe('interactionRemoval registry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the id while pending and commits once after the window', () => {
    const commit = vi.fn();
    scheduleInteractionRemoval('int-1', commit);

    expect(getPendingRemovalIds()).toEqual(['int-1']);
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(getPendingRemovalIds()).toEqual([]);
  });

  it('does not commit before the window expires', () => {
    const commit = vi.fn();
    scheduleInteractionRemoval('int-1', commit);
    vi.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS - 1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel clears the id and never commits', () => {
    const commit = vi.fn();
    scheduleInteractionRemoval('int-1', commit);

    cancelInteractionRemoval('int-1');

    expect(getPendingRemovalIds()).toEqual([]);
    vi.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancelling an unknown id is a no-op', () => {
    expect(() => cancelInteractionRemoval('never-scheduled')).not.toThrow();
  });

  it('notifies subscribers on schedule, cancel and commit', () => {
    const cb = vi.fn();
    const unsub = subscribeInteractionRemovals(cb);

    scheduleInteractionRemoval('int-1', vi.fn());
    expect(cb).toHaveBeenCalledTimes(1);

    cancelInteractionRemoval('int-1');
    expect(cb).toHaveBeenCalledTimes(2);

    scheduleInteractionRemoval('int-1', vi.fn());
    vi.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);
    expect(cb).toHaveBeenCalledTimes(4);

    unsub();
    scheduleInteractionRemoval('int-2', vi.fn());
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('re-scheduling the same id replaces the pending commit', () => {
    const first = vi.fn();
    const second = vi.fn();
    scheduleInteractionRemoval('int-1', first);
    scheduleInteractionRemoval('int-1', second);

    vi.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('independent ids commit on their own timers', () => {
    const a = vi.fn();
    const b = vi.fn();
    scheduleInteractionRemoval('int-a', a);
    scheduleInteractionRemoval('int-b', b);

    cancelInteractionRemoval('int-a');
    vi.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
