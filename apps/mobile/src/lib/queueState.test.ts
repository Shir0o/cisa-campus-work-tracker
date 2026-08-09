// queueState tests — locks down the v2 queue's per-day state store through its
// public seam (QueueState object + useQueueState hook). The store is storage +
// pub/sub only; how the two maps CHANGE lives in @cisa/core's queueDay.ts, so
// these tests assert the mobile wrapper's behavior: persistence keys, hydration
// of stored state, the day-boundary reset, emit-on-change, and the signed-out
// no-op contract of the hook.
//
// Module-level caches persist for the file's lifetime, so each test uses its
// own uid and clears the AsyncStorage mock's backing store between tests.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { QueueState, useQueueState } from './queueState';

const queueKey = (uid: string) => `cisa.m2.queue.${uid}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Let the AsyncStorage mock's promise chain settle (storage was written first,
 *  so awaiting a later read guarantees earlier writes landed). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('QueueState.for', () => {
  it('returns a fresh empty day state for a uid with nothing stored', () => {
    const state = QueueState.for('u1');
    expect(state).toEqual({ day: today(), handled: {}, later: {} });
  });

  it('hydrates a stored state for today and emits to subscribers', async () => {
    const sub = jest.fn();
    const stored = { day: today(), handled: { c1: 123 }, later: {} };
    await AsyncStorage.setItem(queueKey('u2'), JSON.stringify(stored));

    const unsubscribe = QueueState.subscribe(sub);
    QueueState.for('u2');
    expect(sub).not.toHaveBeenCalled(); // not until storage resolves
    await flush();

    expect(QueueState.for('u2').handled).toEqual({ c1: 123 });
    expect(sub).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('ignores a stored state from a previous day (fresh day wins)', async () => {
    const sub = jest.fn();
    await AsyncStorage.setItem(
      queueKey('u3'),
      JSON.stringify({ day: '1970-01-01', handled: { stale: 1 }, later: {} }),
    );

    const unsubscribe = QueueState.subscribe(sub);
    const state = QueueState.for('u3');
    await flush();

    expect(state).toEqual({ day: today(), handled: {}, later: {} });
    expect(sub).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('QueueState.handle / later / reset', () => {
  it('handle marks a card dealt with, drops it from later, saves, and emits', async () => {
    const sub = jest.fn();
    const unsubscribe = QueueState.subscribe(sub);
    QueueState.later('u4', 'c1');
    QueueState.handle('u4', 'c1');

    const state = QueueState.for('u4');
    expect(state.handled).toHaveProperty('c1');
    expect(state.later).toEqual({});
    expect(sub).toHaveBeenCalledTimes(2);

    const raw = JSON.parse((await AsyncStorage.getItem(queueKey('u4')))!);
    expect(raw.day).toBe(today());
    expect(raw.handled.c1).toEqual(expect.any(Number));
    expect(raw.later).toEqual({});
    unsubscribe();
  });

  it('later pushes a card to the back without touching handled, and persists', async () => {
    QueueState.handle('u5', 'c1');
    QueueState.later('u5', 'c2');

    const state = QueueState.for('u5');
    expect(state.handled).toHaveProperty('c1');
    expect(state.later).toHaveProperty('c2');
    expect(state.later.c2).toEqual(expect.any(Number));

    const raw = JSON.parse((await AsyncStorage.getItem(queueKey('u5')))!);
    expect(raw.later.c2).toEqual(expect.any(Number));
  });

  it('reset returns the day to empty and rewrites storage', async () => {
    QueueState.handle('u6', 'c1');
    QueueState.reset('u6');

    expect(QueueState.for('u6')).toEqual({ day: today(), handled: {}, later: {} });
    const raw = JSON.parse((await AsyncStorage.getItem(queueKey('u6')))!);
    expect(raw).toEqual({ day: today(), handled: {}, later: {} });
  });

  it('handledCount counts only handled cards', () => {
    QueueState.handle('u7', 'c1');
    QueueState.handle('u7', 'c2');
    QueueState.later('u7', 'c3');
    expect(QueueState.handledCount('u7')).toBe(2);
  });

  it('crossing midnight while the app is open resets and saves a fresh day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T10:00:00Z'));
    try {
      QueueState.handle('u8', 'c1');
      expect(QueueState.for('u8').day).toBe('2026-08-08');

      jest.setSystemTime(new Date('2026-08-09T10:00:00Z'));
      const state = QueueState.for('u8');

      expect(state).toEqual({ day: '2026-08-09', handled: {}, later: {} });
      const raw = JSON.parse((await AsyncStorage.getItem(queueKey('u8')))!);
      expect(raw.day).toBe('2026-08-09');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('QueueState.subscribe', () => {
  it('unsubscribe stops future notifications', () => {
    const sub = jest.fn();
    const unsubscribe = QueueState.subscribe(sub);
    QueueState.handle('u9', 'c1');
    unsubscribe();
    QueueState.handle('u9', 'c2');
    expect(sub).toHaveBeenCalledTimes(1);
  });
});

describe('useQueueState', () => {
  it('signed out: empty state and no-op actions that never touch storage', () => {
    const { result } = renderHook(() => useQueueState(null));

    expect(result.current.handledCount).toBe(0);
    expect(result.current.handled).toEqual({});
    expect(result.current.later).toEqual({});

    act(() => {
      result.current.handle('c1');
      result.current.pushLater('c1');
      result.current.reset();
    });

    expect(result.current.handledCount).toBe(0);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('signed in: handle / pushLater / reset are reflected live', () => {
    const { result } = renderHook(() => useQueueState('me'));

    act(() => result.current.handle('c1'));
    expect(result.current.handledCount).toBe(1);
    expect(result.current.handled).toHaveProperty('c1');

    act(() => result.current.pushLater('c2'));
    expect(result.current.later).toHaveProperty('c2');

    act(() => result.current.reset());
    expect(result.current.handledCount).toBe(0);
    expect(result.current.later).toEqual({});
  });
});
