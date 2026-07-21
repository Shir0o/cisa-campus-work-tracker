import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoSnack } from '../hooks/useUndoSnack';

describe('useUndoSnack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the message + onUndo, then auto-dismisses after the duration', () => {
    const { result } = renderHook(() => useUndoSnack(5000));
    const onUndo = vi.fn();

    act(() => {
      result.current.showUndoSnack('Page moved to Trash', onUndo);
    });
    expect(result.current.undoSnack).toEqual({ message: 'Page moved to Trash', onUndo });

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.undoSnack).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.undoSnack).toBeNull();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('closeUndoSnack clears immediately and cancels the pending auto-dismiss', () => {
    const { result } = renderHook(() => useUndoSnack(5000));

    act(() => {
      result.current.showUndoSnack('Deleted', vi.fn());
    });
    act(() => {
      result.current.closeUndoSnack();
    });
    expect(result.current.undoSnack).toBeNull();

    // Advancing time past the original duration shouldn't throw or resurface anything.
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(result.current.undoSnack).toBeNull();
  });

  it('showing a new snack resets any pending timer from a previous one', () => {
    const { result } = renderHook(() => useUndoSnack(5000));

    act(() => {
      result.current.showUndoSnack('First', vi.fn());
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      result.current.showUndoSnack('Second', vi.fn());
    });
    // Only 1s past the second call — well under 5s — so it should still be showing.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.undoSnack?.message).toBe('Second');
  });
});
