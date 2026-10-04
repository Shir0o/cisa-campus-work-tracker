import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  limit: vi.fn((n: number) => ({ limit: n })),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));

import { onSnapshot, getDocs } from 'firebase/firestore';
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
  vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as never);
});

describe('firstRunRecordSources', () => {
  it('gates each source by the role whose checklist uses it', () => {
    expect(firstRunRecordSources('admin')).toEqual({ docs: true, messages: false, feedback: false });
    expect(firstRunRecordSources('ft')).toEqual({ docs: true, messages: false, feedback: false });
    expect(firstRunRecordSources('trainee')).toEqual({ docs: false, messages: true, feedback: false });
    expect(firstRunRecordSources('manager')).toEqual({ docs: false, messages: true, feedback: false });
    expect(firstRunRecordSources('operator')).toEqual({ docs: false, messages: true, feedback: true });
    expect(firstRunRecordSources('student')).toEqual({ docs: false, messages: true, feedback: true });
    expect(firstRunRecordSources('community')).toEqual({ docs: false, messages: true, feedback: true });
    expect(firstRunRecordSources(null)).toEqual({ docs: false, messages: true, feedback: false });
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

  it('reads a Trainee messages existence across their chat rooms', async () => {
    vi.mocked(getDocs).mockResolvedValue({ empty: false, docs: [] } as never);
    const { result } = renderHook(() => useFirstRunRecords('trainee', 'u1'));
    expect(onSnapshot).toHaveBeenCalledTimes(1);

    act(() => {
      snapshotSub(0)[1]({ docs: [{ id: 'r1' }, { id: 'r2' }] });
    });
    await waitFor(() => expect(result.current.messagesCount).toBe(1));
    expect(getDocs).toHaveBeenCalledTimes(2);

    vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as never);
    act(() => {
      snapshotSub(0)[1]({ docs: [{ id: 'r1' }] });
    });
    await waitFor(() => expect(result.current.messagesCount).toBe(0));
  });

  it('leaves messages at zero when every room lookup fails', async () => {
    vi.mocked(getDocs).mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useFirstRunRecords('trainee', 'u1'));

    act(() => {
      snapshotSub(0)[1]({ docs: [{ id: 'r1' }] });
    });
    await waitFor(() => expect(getDocs).toHaveBeenCalled());
    expect(result.current.messagesCount).toBe(0);
  });

  it('reads Student feedback and messages existence', async () => {
    const { result } = renderHook(() => useFirstRunRecords('student', 'u1'));
    expect(onSnapshot).toHaveBeenCalledTimes(2);

    act(() => {
      snapshotSub(0)[1]({ empty: false });
    });
    expect(result.current.feedbackCount).toBe(1);

    act(() => {
      snapshotSub(1)[1]({ docs: [] });
    });
    await waitFor(() => expect(result.current.messagesCount).toBe(0));
  });

  it('resets to zero when the uid changes', async () => {
    vi.mocked(getDocs).mockResolvedValue({ empty: false, docs: [] } as never);
    const { result, rerender } = renderHook(
      ({ uid }: { uid: string }) => useFirstRunRecords('trainee', uid),
      { initialProps: { uid: 'u1' } },
    );

    act(() => {
      snapshotSub(0)[1]({ docs: [{ id: 'r1' }] });
    });
    await waitFor(() => expect(result.current.messagesCount).toBe(1));

    vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as never);
    rerender({ uid: 'u2' });
    await waitFor(() => expect(result.current.messagesCount).toBe(0));
  });
});
