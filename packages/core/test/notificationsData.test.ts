import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  arrayUnion: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { subscribeNotifications } from '../src/data/notifications';

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.onSnapshot.mockImplementation((_q: unknown, cb: (snap: { docs: unknown[] }) => void) => {
    cb({ docs: [] });
    return () => {};
  });
});

describe('subscribeNotifications (packages/core)', () => {
  it('queries only the personal stream by default — the rules deny ALL_ADMINS to non-Full-timers', () => {
    subscribeNotifications({} as never, 'u1', vi.fn());
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1);
    expect(firestoreMock.where).toHaveBeenCalledWith('userId', '==', 'u1');
    expect(firestoreMock.where).not.toHaveBeenCalledWith('userId', '==', 'ALL_ADMINS');
  });

  it('shows everything it receives — nothing is filtered out as set aside', () => {
    const cb = vi.fn();
    firestoreMock.onSnapshot.mockImplementation((_q: unknown, next: (snap: unknown) => void) => {
      next({
        docs: [
          { id: 'n1', data: () => ({ userId: 'u1', title: 'Set aside once', type: 'info', read: false, dismissedBy: ['u1'] }) },
        ],
      });
      return () => {};
    });
    subscribeNotifications({} as never, 'u1', cb);
    expect(cb).toHaveBeenCalledWith([expect.objectContaining({ id: 'n1', title: 'Set aside once' })]);
  });

  it('also queries the ALL_ADMINS broadcasts when includeBroadcast is set (Full-timers)', () => {
    const cb = vi.fn();
    subscribeNotifications({} as never, 'u1', cb, undefined, { includeBroadcast: true });
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(2);
    expect(firestoreMock.where).toHaveBeenCalledWith('userId', '==', 'ALL_ADMINS');
    expect(cb).toHaveBeenCalledWith([]);
  });
});
