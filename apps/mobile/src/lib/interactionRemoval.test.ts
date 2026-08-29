import {
  scheduleInteractionRemoval,
  cancelInteractionRemoval,
  getPendingRemovalIds,
  subscribeInteractionRemovals,
  INTERACTION_REMOVAL_WINDOW_MS,
} from './interactionRemoval';

describe('interactionRemoval registry (mobile)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hides the id while pending and commits once after the window', () => {
    const commit = jest.fn();
    scheduleInteractionRemoval('int-1', commit);

    expect(getPendingRemovalIds()).toEqual(['int-1']);
    expect(commit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(getPendingRemovalIds()).toEqual([]);
  });

  it('does not commit before the window expires', () => {
    const commit = jest.fn();
    scheduleInteractionRemoval('int-1', commit);
    jest.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS - 1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel clears the id and never commits', () => {
    const commit = jest.fn();
    scheduleInteractionRemoval('int-1', commit);

    cancelInteractionRemoval('int-1');

    expect(getPendingRemovalIds()).toEqual([]);
    jest.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancelling an unknown id is a no-op', () => {
    expect(() => cancelInteractionRemoval('never-scheduled')).not.toThrow();
  });

  it('notifies subscribers on schedule, cancel and commit', () => {
    const cb = jest.fn();
    const unsub = subscribeInteractionRemovals(cb);

    scheduleInteractionRemoval('int-1', jest.fn());
    expect(cb).toHaveBeenCalledTimes(1);

    cancelInteractionRemoval('int-1');
    expect(cb).toHaveBeenCalledTimes(2);

    scheduleInteractionRemoval('int-1', jest.fn());
    jest.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);
    expect(cb).toHaveBeenCalledTimes(4);

    unsub();
    scheduleInteractionRemoval('int-2', jest.fn());
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('re-scheduling the same id replaces the pending commit', () => {
    const first = jest.fn();
    const second = jest.fn();
    scheduleInteractionRemoval('int-1', first);
    scheduleInteractionRemoval('int-1', second);

    jest.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('independent ids commit on their own timers', () => {
    const a = jest.fn();
    const b = jest.fn();
    scheduleInteractionRemoval('int-a', a);
    scheduleInteractionRemoval('int-b', b);

    cancelInteractionRemoval('int-a');
    jest.advanceTimersByTime(INTERACTION_REMOVAL_WINDOW_MS);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
