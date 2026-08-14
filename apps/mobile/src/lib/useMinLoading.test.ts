import { act, renderHook } from '@testing-library/react-native';
import { MIN_SKELETON_MS, useMinLoading } from './useMinLoading';

describe('useMinLoading', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds the skeleton for the minimum duration when data arrives early', () => {
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => useMinLoading(loading), {
      initialProps: { loading: true },
    });
    expect(result.current).toBe(true);

    act(() => {
      rerender({ loading: false });
    });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS - 1);
    });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('lets the content through as soon as data lands after the minimum', () => {
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => useMinLoading(loading), {
      initialProps: { loading: true },
    });

    act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS);
    });
    act(() => {
      rerender({ loading: false });
    });
    expect(result.current).toBe(false);
  });

  it('restarts the hold when loading turns on again mid-hold', () => {
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => useMinLoading(loading), {
      initialProps: { loading: true },
    });

    act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS - 200);
    });
    act(() => {
      rerender({ loading: false });
    });
    // Identity switches again before the first hold expires — the second
    // switch must get a full minimum of its own.
    act(() => {
      rerender({ loading: true });
    });
    act(() => {
      rerender({ loading: false });
    });
    act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS - 1);
    });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});
