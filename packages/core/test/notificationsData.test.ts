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

  it('also queries the ALL_ADMINS broadcasts when includeBroadcast is set (Full-timers)', () => {
    const cb = vi.fn();
    subscribeNotifications({} as never, 'u1', cb, undefined, { includeBroadcast: true });
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(2);
    expect(firestoreMock.where).toHaveBeenCalledWith('userId', '==', 'ALL_ADMINS');
    expect(cb).toHaveBeenCalledWith([]);
  });
});
