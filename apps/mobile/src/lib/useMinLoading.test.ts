import { act, renderHook } from '@testing-library/react-native';
import { MIN_SKELETON_MS, useMinLoading } from './useMinLoading';

describe('useMinLoading', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds the skeleton for the minimum duration when data arrives early', async () => {
    const { result, rerender } = await renderHook(({ loading }: { loading: boolean }) => useMinLoading(loading), {
      initialProps: { loading: true },
    });
    expect(result.current).toBe(true);

    await act(async () => {
      await rerender({ loading: false });
    });
    expect(result.current).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS - 1);
    });
    expect(result.current).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it('lets the content through as soon as data lands after the minimum', async () => {
    const { result, rerender } = await renderHook(({ loading }: { loading: boolean }) => useMinLoading(loading), {
      initialProps: { loading: true },
    });

    await act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS);
    });
    await act(async () => {
      await rerender({ loading: false });
    });
    expect(result.current).toBe(false);
  });

  it('restarts the hold when loading turns on again mid-hold', async () => {
    const { result, rerender } = await renderHook(({ loading }: { loading: boolean }) => useMinLoading(loading), {
      initialProps: { loading: true },
    });

    await act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS - 200);
    });
    await act(async () => {
      await rerender({ loading: false });
    });
    // Identity switches again before the first hold expires — the second
    // switch must get a full minimum of its own.
    await act(async () => {
      await rerender({ loading: true });
    });
    await act(async () => {
      await rerender({ loading: false });
    });
    await act(() => {
      jest.advanceTimersByTime(MIN_SKELETON_MS - 1);
    });
    expect(result.current).toBe(true);

    await act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});
