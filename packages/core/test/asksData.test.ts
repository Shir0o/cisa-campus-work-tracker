import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { subscribeAsks, subscribeMyAsks } from '../src/data/asks';

const COLLECTION = { __collection: 'asks' };
const WHERE_RESULT = { __where: true };
const QUERY_RESULT = { __query: true };

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.collection.mockReturnValue(COLLECTION);
  firestoreMock.where.mockReturnValue(WHERE_RESULT);
  firestoreMock.query.mockReturnValue(QUERY_RESULT);
  firestoreMock.onSnapshot.mockImplementation((_q: unknown, cb: (snap: { docs: unknown[] }) => void) => {
    cb({ docs: [] });
    return () => {};
  });
});

describe('subscribeAsks (packages/core)', () => {
  it('subscribes to entire asks collection by default (full-timer/admin)', () => {
    const cb = vi.fn();
    const unsub = subscribeAsks({} as never, cb);
    expect(firestoreMock.onSnapshot).toHaveBeenCalledWith(
      COLLECTION,
      expect.any(Function),
      expect.any(Function),
    );
    expect(cb).toHaveBeenCalledWith([]);
    expect(typeof unsub).toBe('function');
  });

  it('subscribes to entire asks collection when isAdmin is explicitly true', () => {
    const cb = vi.fn();
    subscribeAsks({} as never, cb, undefined, { uid: 'ft1', isAdmin: true });
    expect(firestoreMock.onSnapshot).toHaveBeenCalledWith(
      COLLECTION,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('scopes query with where("owner", "==", uid) when isAdmin is false', () => {
    const cb = vi.fn();
    subscribeAsks({} as never, cb, undefined, { uid: 'trainee1', isAdmin: false });
    expect(firestoreMock.where).toHaveBeenCalledWith('owner', '==', 'trainee1');
    expect(firestoreMock.query).toHaveBeenCalledWith(COLLECTION, WHERE_RESULT);
    expect(firestoreMock.onSnapshot).toHaveBeenCalledWith(
      QUERY_RESULT,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('scopes query when options are passed as the 3rd argument without onError', () => {
    const cb = vi.fn();
    subscribeAsks({} as never, cb, { uid: 'trainee1', isAdmin: false });
    expect(firestoreMock.where).toHaveBeenCalledWith('owner', '==', 'trainee1');
    expect(firestoreMock.query).toHaveBeenCalledWith(COLLECTION, WHERE_RESULT);
  });

  it('safely yields empty list and no-ops when isAdmin is false and uid is missing', () => {
    const cb = vi.fn();
    const unsub = subscribeAsks({} as never, cb, { isAdmin: false });
    expect(firestoreMock.onSnapshot).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith([]);
    expect(typeof unsub).toBe('function');
  });

  it('handles onError callback when snapshot errors', () => {
    const errCb = vi.fn();
    const testErr = new Error('permission denied');
    firestoreMock.onSnapshot.mockImplementation((_q: unknown, _cb: unknown, onErr: (e: unknown) => void) => {
      onErr(testErr);
      return () => {};
    });

    subscribeAsks({} as never, vi.fn(), errCb, { uid: 'trainee1', isAdmin: false });
    expect(errCb).toHaveBeenCalledWith(testErr);
  });
});

describe('subscribeMyAsks (packages/core)', () => {
  it('delegates to scoped query for the given uid', () => {
    const cb = vi.fn();
    subscribeMyAsks({} as never, 'trainee1', cb);
    expect(firestoreMock.where).toHaveBeenCalledWith('owner', '==', 'trainee1');
    expect(firestoreMock.query).toHaveBeenCalledWith(COLLECTION, WHERE_RESULT);
    expect(firestoreMock.onSnapshot).toHaveBeenCalledWith(
      QUERY_RESULT,
      expect.any(Function),
      expect.any(Function),
    );
  });
});
