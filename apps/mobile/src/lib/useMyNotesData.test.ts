// The notes hook must drop the previous identity's list synchronously when the
// signed-in user changes (the impersonation flash), and surface load errors —
// the web page's own regression (ADR 0019) was a silent failure that looked
// like an empty list.
import { act, renderHook } from '@testing-library/react-native';
import { useMyNotesData } from './useMyNotesData';

type TestAuth = { uid: string | null };
type TestCbs = Record<string, unknown>;

jest.mock('./AuthProvider', () => ({
  useAuth: () => (globalThis as unknown as { __notesAuth: TestAuth }).__notesAuth,
}));

jest.mock('./data/feedback', () => ({
  subscribeMyNotes: (_uid: string, cb: (notes: unknown[]) => void, onError?: (e: unknown) => void) => {
    (globalThis as unknown as { __notesCbs: TestCbs }).__notesCbs.notes = { cb, onError };
    return () => undefined;
  },
}));

jest.mock('./firebase', () => ({
  handleFirestoreError: jest.fn(),
  OperationType: { LIST: 'list' },
}));

const auth: TestAuth = { uid: 'user1' };
const cbs: TestCbs = {};
(globalThis as unknown as { __notesAuth: TestAuth }).__notesAuth = auth;
(globalThis as unknown as { __notesCbs: TestCbs }).__notesCbs = cbs;

const note = (id: string) => ({
  id,
  userId: 'user1',
  userName: 'User One',
  userEmail: 'one@example.com',
  type: 'enhancement',
  kind: 'idea',
  message: 'hello',
  status: 'new',
  createdAt: new Date().toISOString(),
});

describe('useMyNotesData', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    auth.uid = 'user1';
    delete cbs.notes;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the signed-in user’s own notes once the snapshot lands', () => {
    const { result } = renderHook(() => useMyNotesData());

    expect(result.current.loading).toBe(true);
    act(() => {
      (cbs.notes as { cb: (n: unknown[]) => void }).cb([note('n1'), note('n2')]);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.notes).toHaveLength(2);
    expect(result.current.notes[0].id).toBe('n1');
  });

  it('clears the previous identity’s notes and returns to loading on uid change', () => {
    const { result, rerender } = renderHook(() => useMyNotesData());

    act(() => {
      (cbs.notes as { cb: (n: unknown[]) => void }).cb([note('n1')]);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.notes).toHaveLength(1);

    auth.uid = 'user2';
    rerender(undefined);

    expect(result.current.loading).toBe(true);
    expect(result.current.notes).toHaveLength(0);
  });

  it('surfaces a load error instead of silently showing nothing', () => {
    const { result } = renderHook(() => useMyNotesData());

    act(() => {
      (cbs.notes as { onError: (e: unknown) => void }).onError(new Error('denied'));
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.notes).toHaveLength(0);
  });
});