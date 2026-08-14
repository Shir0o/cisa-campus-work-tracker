import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { subscribeChatRooms, deleteChatMessage } from '../src/data/chat';

const COLLECTION = { __collection: 'chatRooms' };
const WHERE_RESULT = { __where: true };
const QUERY_RESULT = { __query: true };

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.collection.mockReturnValue(COLLECTION);
  firestoreMock.where.mockReturnValue(WHERE_RESULT);
  firestoreMock.orderBy.mockReturnValue({ __orderBy: true });
  firestoreMock.query.mockReturnValue(QUERY_RESULT);
  firestoreMock.onSnapshot.mockImplementation((_q: unknown, cb: (snap: { docs: unknown[] }) => void) => {
    cb({ docs: [] });
    return () => {};
  });
});

describe('subscribeChatRooms', () => {
  it('scopes the rooms query to the current user via memberIds array-contains', () => {
    subscribeChatRooms({} as never, 'uidX', () => {});
    expect(firestoreMock.where).toHaveBeenCalledWith('memberIds', 'array-contains', 'uidX');
    expect(firestoreMock.query).toHaveBeenCalledWith(COLLECTION, WHERE_RESULT);
  });

  it('never lists every room (the old admin see-all branch is gone)', () => {
    subscribeChatRooms({} as never, 'uidX', () => {});
    expect(firestoreMock.orderBy).not.toHaveBeenCalled();
  });

  it('passes the mapped (empty) room list to the callback and returns an unsubscribe fn', () => {
    const cb = vi.fn();
    const unsub = subscribeChatRooms({} as never, 'uidX', cb);
    expect(cb).toHaveBeenCalledWith([]);
    expect(typeof unsub).toBe('function');
  });
});

describe('deleteChatMessage', () => {
  it('calls deleteDoc on the specific chat message document', async () => {
    const mockDb = {};
    const docRef = { __docRef: true };
    firestoreMock.doc.mockReturnValue(docRef);
    firestoreMock.deleteDoc.mockResolvedValue(undefined);

    await deleteChatMessage(mockDb as never, 'r1', 'm1');

    expect(firestoreMock.doc).toHaveBeenCalledWith(mockDb, 'chatRooms', 'r1', 'messages', 'm1');
    expect(firestoreMock.deleteDoc).toHaveBeenCalledWith(docRef);
  });
});
