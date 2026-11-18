import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  limit: vi.fn((n: number) => ({ limit: n })),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));

import { onSnapshot } from 'firebase/firestore';
import {
  EMPTY_FIRST_RUN_RECORDS,
  existenceFlag,
  firstRunRecordSources,
  useFirstRunRecords,
} from '../lib/firstRunRecords';

const snapshotSub = (index: number) => {
  const calls = vi.mocked(onSnapshot).mock.calls;
  return calls[index] as unknown as [unknown, (s: unknown) => void, () => void];
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(onSnapshot).mockImplementation(() => vi.fn());
});

describe('firstRunRecordSources', () => {
  it('gates each source by the role whose checklist uses it', () => {
    expect(firstRunRecordSources('admin')).toEqual({ docs: true });
    expect(firstRunRecordSources('ft')).toEqual({ docs: true });
    expect(firstRunRecordSources('trainee')).toEqual({ docs: false });
    expect(firstRunRecordSources('manager')).toEqual({ docs: false });
    expect(firstRunRecordSources(null)).toEqual({ docs: false });
  });
});

describe('existenceFlag', () => {
  it('collapses presence to 0 or 1', () => {
    expect(existenceFlag(true)).toBe(1);
    expect(existenceFlag(false)).toBe(0);
  });
});

describe('useFirstRunRecords', () => {
  it('stays at zero with no uid and opens no listener', () => {
    const { result } = renderHook(() => useFirstRunRecords('admin', null));
    expect(result.current).toEqual(EMPTY_FIRST_RUN_RECORDS);
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('reads a Full-timer docs existence from board_docs', () => {
    const { result } = renderHook(() => useFirstRunRecords('admin', 'u1'));
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    act(() => {
      snapshotSub(0)[1]({ empty: false });
    });
    expect(result.current.docsCount).toBe(1);

    act(() => {
      snapshotSub(0)[1]({ empty: true });
    });
    expect(result.current.docsCount).toBe(0);

    act(() => {
      snapshotSub(0)[2]();
    });
    expect(result.current.docsCount).toBe(0);
  });

  it('opens no listener for a Trainee, whose checklist reads no record existence', () => {
    const { result } = renderHook(() => useFirstRunRecords('trainee', 'u1'));
    expect(result.current).toEqual(EMPTY_FIRST_RUN_RECORDS);
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('resets to zero when the uid changes', () => {
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useFirstRunRecords('admin', uid),
      { initialProps: { uid: 'u1' } },
    );

    act(() => {
      snapshotSub(0)[1]({ empty: false });
    });
    expect(result.current.docsCount).toBe(1);

    rerender({ uid: 'u2' });
    expect(result.current.docsCount).toBe(0);
  });
});
