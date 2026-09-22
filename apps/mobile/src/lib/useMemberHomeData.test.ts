// Regression: a read failure (Firestore rules denial, App Check rejection,
// a network drop) must NOT leave the trainee home showing only the skeleton
// loader forever. `loading` starts true and was flipped false only by the
// events subscription's SUCCESS callback; the error path set `error` but left
// `loading` true, so a failed read rendered an infinite skeleton with the error
// text never shown. And if a subscription neither resolves nor errors, the load
// timeout must end the skeleton rather than hang.
import { act, renderHook } from '@testing-library/react-native';
import { useMemberHomeData, LOAD_TIMEOUT_MS } from './useMemberHomeData';

type Cbs = Record<string, unknown>;
type ErrCb = (e: unknown) => void;
type ListCb<T> = (v: T) => void;

jest.mock('./data/events', () => ({
  subscribeEvents: (cb: (v: unknown[]) => void, onError?: ErrCb) => {
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.events = cb;
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.eventsErr = onError;
    return () => undefined;
  },
}));

jest.mock('./data/rsvp', () => ({
  subscribeMyRsvps: (_uid: string, cb: (v: Set<string>) => void, onError?: ErrCb) => {
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.rsvps = cb;
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.rsvpsErr = onError;
    return () => undefined;
  },
  setRsvp: jest.fn(),
}));

jest.mock('./data/chat', () => ({
  subscribeChatRooms: (_uid: string, cb: ListCb<unknown[]>, onError?: ErrCb) => {
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.rooms = cb;
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.roomsErr = onError;
    return () => undefined;
  },
}));

jest.mock('./data/users', () => ({
  subscribeFullTimers: (cb: ListCb<unknown[]>, onError?: ErrCb) => {
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.fullTimers = cb;
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.fullTimersErr = onError;
    return () => undefined;
  },
}));

jest.mock('./data/hospitality', () => ({
  subscribeMyHospitalityOffer: (_uid: string, cb: ListCb<unknown>, onError?: ErrCb) => {
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.offer = cb;
    (globalThis as unknown as { __memberCbs: Cbs }).__memberCbs.offerErr = onError;
    return () => undefined;
  },
  saveHospitalityOffer: jest.fn(),
  deleteHospitalityOffer: jest.fn(),
}));

jest.mock('./data/chatReads', () => ({
  useChatReads: () => ({ getLastRead: () => null }),
}));

jest.mock('./firebase', () => ({
  handleFirestoreError: jest.fn(),
  OperationType: { LIST: 'list' },
}));

jest.mock('./useIdentityReset', () => ({
  useIdentityReset: () => {},
}));

const cbs: Cbs = {};
(globalThis as unknown as { __memberCbs: Cbs }).__memberCbs = cbs;

const emitError = (path: 'events' | 'rsvps' | 'rooms') => {
  const cb = cbs[`${path}Err`] as ErrCb | undefined;
  cb?.(new Error(`denied ${path}`));
};

describe('useMemberHomeData loading escape', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    for (const k of Object.keys(cbs)) delete cbs[k];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ends the skeleton (loading false) when the events read errors, so the error can surface', async () => {
    const { result } = await renderHook(() => useMemberHomeData('user1', 'Test'));

    await act(() => {
      emitError('events');
      // let the 500ms minimum-skeleton hold run out
      jest.advanceTimersByTime(600);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toContain("Couldn't load events");
  });

  it('ends the skeleton via the load timeout when a subscription never settles', async () => {
    const { result } = await renderHook(() => useMemberHomeData('user1', 'Test'));

    await act(() => {
      jest.advanceTimersByTime(LOAD_TIMEOUT_MS + 10);
    });

    expect(result.current.loading).toBe(false);
  });
});