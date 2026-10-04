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
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import {
  acknowledgeAnnouncement,
  markAnnouncementRead,
  removeMessageForEveryone,
  sendMessage,
  subscribeChatRoom,
  subscribeChatRooms,
  subscribeRoomMessages,
  togglePinMessage,
} from '../src/data/chat';

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

describe('subscribeRoomMessages', () => {
  it('keeps the thread, pin, tombstone and receipt fields the rules let people write (#1262)', () => {
    const at = { toDate: () => new Date('2026-09-30T10:00:00.000Z') };
    firestoreMock.onSnapshot.mockImplementation((_q: unknown, cb: (snap: { docs: unknown[] }) => void) => {
      cb({
        docs: [
          {
            id: 'm1',
            data: () => ({
              roomId: 'r1',
              text: 'hi',
              senderId: 'u1',
              senderName: 'Naomi',
              senderPhoto: 'https://x/p.png',
              timestamp: at,
              type: 'text',
              parentId: 'm0',
              pinned: true,
              pinnedBy: 'u2',
              readBy: ['u3'],
              acknowledged: ['u3'],
              deleted: { by: 'u2', at },
            }),
          },
          { id: 'm2', data: () => ({ roomId: 'r1', text: 'plain', senderId: 'u1', senderName: 'N', timestamp: at }) },
        ],
      });
      return () => {};
    });
    const cb = vi.fn();
    subscribeRoomMessages({} as never, 'r1', cb);
    const [first, second] = cb.mock.calls[0][0];
    expect(first).toMatchObject({
      parentId: 'm0',
      pinned: true,
      pinnedBy: 'u2',
      readBy: ['u3'],
      acknowledged: ['u3'],
      senderPhoto: 'https://x/p.png',
      deleted: { by: 'u2', at: '2026-09-30T10:00:00.000Z' },
    });
    expect(second.parentId).toBeNull();
    expect(second.deleted).toBeUndefined();
    expect(second.acknowledged).toBeUndefined();
  });
});

describe('subscribeChatRoom (the room reader carries the audience preset, #1279)', () => {
  it('carries audiencePreset off the room doc so the reader can name the audience', () => {
    firestoreMock.onSnapshot.mockImplementation((_q: unknown, cb: (snap: unknown) => void) => {
      cb({
        id: 'r1',
        exists: () => true,
        data: () => ({
          type: 'announcement',
          name: 'Campus Updates',
          memberIds: ['u1', 'u2'],
          createdById: 'u1',
          createdByName: 'Mei',
          createdAt: { toDate: () => new Date('2026-09-30T10:00:00.000Z') },
          audiencePreset: 'everyone',
        }),
      });
      return () => {};
    });
    const cb = vi.fn();
    subscribeChatRoom({} as never, 'r1', cb);
    expect(cb.mock.calls[0][0]).toMatchObject({ id: 'r1', audiencePreset: 'everyone' });
  });
});

describe('message acts (the field-level writes firestore.rules allows)', () => {
  const docRef = { __docRef: true };
  beforeEach(() => {
    firestoreMock.doc.mockReturnValue(docRef);
    firestoreMock.updateDoc.mockResolvedValue(undefined);
    firestoreMock.serverTimestamp.mockReturnValue('SERVER_TIME');
    firestoreMock.deleteField.mockReturnValue('DELETE_FIELD');
  });

  it('takes a message back with a tombstone rather than deleting it', async () => {
    await removeMessageForEveryone({} as never, 'r1', 'm1', 'u1');
    expect(firestoreMock.doc).toHaveBeenCalledWith({}, 'chatRooms', 'r1', 'messages', 'm1');
    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(docRef, { deleted: { by: 'u1', at: 'SERVER_TIME' } });
    expect(firestoreMock.deleteDoc).not.toHaveBeenCalled();
  });

  it('says got it by adding only the viewer to acknowledged, and takes it back by removing only them', async () => {
    await acknowledgeAnnouncement({} as never, 'r1', 'm1', 'u1', ['u2']);
    expect(firestoreMock.updateDoc).toHaveBeenLastCalledWith(docRef, { acknowledged: ['u2', 'u1'] });
    await acknowledgeAnnouncement({} as never, 'r1', 'm1', 'u1', ['u2', 'u1']);
    expect(firestoreMock.updateDoc).toHaveBeenLastCalledWith(docRef, { acknowledged: ['u2'] });
  });

  it('records a passive read receipt by adding only the viewer to readBy (#1277)', async () => {
    firestoreMock.arrayUnion.mockReturnValue('UNION');
    await markAnnouncementRead({} as never, 'r1', 'm1', 'u1');
    expect(firestoreMock.doc).toHaveBeenCalledWith({}, 'chatRooms', 'r1', 'messages', 'm1');
    expect(firestoreMock.arrayUnion).toHaveBeenCalledWith('u1');
    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(docRef, { readBy: 'UNION' });
  });

  it('pins naming who pinned, and unpins by clearing pinnedBy', async () => {
    await togglePinMessage({} as never, 'r1', 'm1', true, 'u1');
    expect(firestoreMock.updateDoc).toHaveBeenLastCalledWith(docRef, { pinned: true, pinnedBy: 'u1' });
    await togglePinMessage({} as never, 'r1', 'm1', false, 'u1');
    expect(firestoreMock.updateDoc).toHaveBeenLastCalledWith(docRef, { pinned: false, pinnedBy: 'DELETE_FIELD' });
  });
});

describe('sendMessage notifications', () => {
  const sender = { uid: 'u1', displayName: 'Naomi' };

  beforeEach(() => {
    firestoreMock.addDoc.mockResolvedValue({ id: 'm1' });
    firestoreMock.updateDoc.mockResolvedValue(undefined);
  });

  it('titles a regular room push "New message"', async () => {
    const onNotify = vi.fn();
    await sendMessage({} as never, 'r1', 'hi', sender, undefined, {
      memberIds: ['u1', 'u2'],
      onNotify,
    });
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', title: 'New message', message: 'Naomi: hi' }),
    );
  });

  it('titles an announcement push with the channel name and the announcement body (#1243)', async () => {
    const onNotify = vi.fn();
    await sendMessage({} as never, 'r1', 'Retreat is Saturday', sender, undefined, {
      memberIds: ['u1', 'u2'],
      onNotify,
      roomType: 'announcement',
      roomName: 'Campus Updates',
    });
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u2',
        title: 'Campus Updates',
        message: 'Naomi posted an announcement: Retreat is Saturday',
      }),
    );
  });

  it('writes a reply with its parent, null for a top-level message, and says so in the preview', async () => {
    await sendMessage({} as never, 'r1', 'hi', sender, undefined, { memberIds: ['u1'], parentId: 'm0' });
    expect(firestoreMock.addDoc.mock.calls[0][1]).toMatchObject({ text: 'hi', parentId: 'm0' });
    expect(firestoreMock.updateDoc.mock.calls[0][1].lastMessage.text).toBe('in a thread: hi');
    await sendMessage({} as never, 'r1', 'top', sender, undefined, { memberIds: ['u1'] });
    expect(firestoreMock.addDoc.mock.calls[1][1].parentId).toBeNull();
  });

  it('tells the whole room about a reply in a group', async () => {
    const onNotify = vi.fn();
    await sendMessage({} as never, 'r1', 'yes', sender, undefined, {
      memberIds: ['u1', 'u2', 'u3'],
      onNotify,
      roomType: 'group',
      parentId: 'm0',
    });
    expect(onNotify.mock.calls.map((c) => c[0].userId)).toEqual(['u2', 'u3']);
  });

  it('links a thread reply to the Thread under its parent (#1303)', async () => {
    const onNotify = vi.fn();
    await sendMessage({} as never, 'r1', 'yes', sender, undefined, {
      memberIds: ['u1', 'u2'],
      onNotify,
      roomType: 'group',
      parentId: 'm0',
    });
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ link: '/messages/r1?parent=m0' }));

    onNotify.mockClear();
    await sendMessage({} as never, 'r1', 'top', sender, undefined, { memberIds: ['u1', 'u2'], onNotify });
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ link: '/messages/r1' }));
  });

  it("tells only the post's author and its thread's repliers about a reply in an announcement (as the web does)", async () => {
    firestoreMock.getDocs.mockResolvedValue({ docs: [{ data: () => ({ senderId: 'u3' }) }, { data: () => ({ senderId: 'u1' }) }] });
    firestoreMock.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ senderId: 'u2' }) });
    const onNotify = vi.fn();
    await sendMessage({} as never, 'r1', 'Got a question', sender, undefined, {
      memberIds: ['u1', 'u2', 'u3', 'u4'],
      onNotify,
      roomType: 'announcement',
      roomName: 'Campus Updates',
      parentId: 'm0',
    });
    expect(onNotify.mock.calls.map((c) => c[0].userId).sort()).toEqual(['u2', 'u3']);
    expect(onNotify.mock.calls[0][0]).toMatchObject({ title: 'Campus Updates', message: 'Naomi: in a thread: Got a question' });
  });
});
