// The hooks must drop stale content the moment the signed-in identity changes —
// that is exactly the impersonation ("See it as they do") flash: the previous
// viewer's messages stay rendered until the new subscription's first snapshot
// lands. The reset is synchronous (a render-phase state adjustment), so the
// assertions below run against the very first post-change render.
import { act, renderHook } from '@testing-library/react-native';
import { useChatThreadData } from './useChatThreadData';
import { acknowledgeAnnouncement, markAnnouncementRead, removeMessageForEveryone, sendMessage, togglePinMessage } from './data/chat';
import { ChatReads } from './data/chatReads';

type TestState = { uid: string | null; user: null };
type TestCbs = Record<string, unknown>;

jest.mock('./AuthProvider', () => ({
  useAuth: () => (globalThis as unknown as { __cisaAuth: TestState }).__cisaAuth,
}));

jest.mock('./data/chat', () => ({
  subscribeChatRoom: (_id: string, cb: (room: unknown) => void) => {
    (globalThis as unknown as { __chatThreadCbs: TestCbs }).__chatThreadCbs.room = cb;
    return () => undefined;
  },
  subscribeRoomMessages: (_id: string, cb: (messages: unknown[]) => void) => {
    (globalThis as unknown as { __chatThreadCbs: TestCbs }).__chatThreadCbs.messages = cb;
    return () => undefined;
  },
  sendMessage: jest.fn(),
  acknowledgeAnnouncement: jest.fn(),
  markAnnouncementRead: jest.fn(),
  togglePinMessage: jest.fn(),
  removeMessageForEveryone: jest.fn(),
}));

jest.mock('./data/users', () => ({
  subscribeUsers: () => () => undefined,
}));

jest.mock('./data/contacts', () => ({
  subscribeContacts: () => () => undefined,
}));

jest.mock('./data/chatReads', () => ({
  ChatReads: { markRead: jest.fn(), getLastRead: jest.fn(() => null) },
}));

jest.mock('./firebase', () => ({
  handleFirestoreError: jest.fn(),
  OperationType: { LIST: 'list' },
}));

const authState: TestState = { uid: 'user1', user: null };
const cbs: TestCbs = {};
(globalThis as unknown as { __cisaAuth: TestState }).__cisaAuth = authState;
(globalThis as unknown as { __chatThreadCbs: TestCbs }).__chatThreadCbs = cbs;

const emitRoom = (room: unknown) => (cbs.room as (r: unknown) => void)(room);
const emitMessages = (messages: unknown[]) => (cbs.messages as (m: unknown[]) => void)(messages);

const message = (id: string) => ({
  id,
  roomId: 'room1',
  senderId: 'user2',
  text: 'hello',
  timestamp: new Date().toISOString(),
});

describe('useChatThreadData', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    authState.uid = 'user1';
    delete cbs.room;
    delete cbs.messages;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears stale messages and returns to loading when the uid changes', async () => {
    const { result, rerender } = await renderHook(({ roomId }: { roomId: string }) => useChatThreadData(roomId), {
      initialProps: { roomId: 'room1' },
    });

    await act(() => {
      emitMessages([message('m1')]);
    });
    // Data has landed, but the skeleton's minimum duration keeps it up...
    expect(result.current.loading).toBe(true);
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.messages).toHaveLength(1);

    authState.uid = 'user2';
    await rerender({ roomId: 'room1' });

    expect(result.current.loading).toBe(true);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.room).toBeNull();
  });

  it('clears stale messages and returns to loading when the room changes', async () => {
    const { result, rerender } = await renderHook(({ roomId }: { roomId: string }) => useChatThreadData(roomId), {
      initialProps: { roomId: 'room1' },
    });

    await act(() => {
      emitMessages([message('m1')]);
    });
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.messages).toHaveLength(1);

    await rerender({ roomId: 'room2' });

    expect(result.current.loading).toBe(true);
    expect(result.current.messages).toHaveLength(0);
  });

  // #1243: the push for an announcement post is titled with the channel name —
  // core can only do that if the hook tells it which room type it is sending to.
  it('sends with the room type and name so an announcement push is titled with the channel', async () => {
    authState.uid = 'user1';
    const { result } = await renderHook(() => useChatThreadData('room1'));
    await act(() => {
      emitRoom({ id: 'room1', type: 'announcement', name: 'Campus Updates', memberIds: ['user1', 'user2'] });
    });

    await act(async () => {
      await result.current.send('Retreat is Saturday');
    });

    expect(sendMessage).toHaveBeenCalledWith(
      'room1',
      'Retreat is Saturday',
      expect.objectContaining({ uid: 'user1' }),
      undefined,
      ['user1', 'user2'],
      { type: 'announcement', name: 'Campus Updates' },
      null,
    );
  });

  it('sends a reply with its parent (#1262)', async () => {
    const { result } = await renderHook(() => useChatThreadData('room1'));
    await act(() => {
      emitRoom({ id: 'room1', type: 'group', name: 'Team', memberIds: ['user1', 'user2'] });
    });
    await act(async () => {
      await result.current.send('Count me in', 'm0');
    });
    expect((sendMessage as jest.Mock).mock.calls.at(-1)[6]).toBe('m0');
  });

  it("keeps the room's last-read from before this visit for the New line, though opening it marks it read", async () => {
    (ChatReads.getLastRead as jest.Mock).mockReturnValue(Date.parse('2026-09-28T10:00:00.000Z'));
    const { result } = await renderHook(() => useChatThreadData('room1'));
    await act(() => {
      emitMessages([message('m1')]);
    });
    (ChatReads.getLastRead as jest.Mock).mockReturnValue(Date.now());
    await act(() => {
      emitMessages([message('m1'), message('m2')]);
    });
    expect(result.current.lastReadAt).toBe('2026-09-28T10:00:00.000Z');
    expect(ChatReads.markRead).toHaveBeenCalled();
    (ChatReads.getLastRead as jest.Mock).mockReturnValue(null);
  });

  it('says Got it, pins and takes back through the chat data layer, as the viewer', async () => {
    const { result } = await renderHook(() => useChatThreadData('room1'));
    const post = { ...message('m1'), acknowledged: ['user2'] };
    await act(async () => {
      await result.current.acknowledge(post as never);
      await result.current.pin('m1', true);
      await result.current.remove('m1');
    });
    expect(acknowledgeAnnouncement).toHaveBeenCalledWith('room1', 'm1', 'user1', ['user2']);
    expect(togglePinMessage).toHaveBeenCalledWith('room1', 'm1', true, 'user1');
    expect(removeMessageForEveryone).toHaveBeenCalledWith('room1', 'm1', 'user1');
  });

  it('records a read receipt through the chat data layer, as the viewer (#1277)', async () => {
    const { result } = await renderHook(() => useChatThreadData('room1'));
    await act(async () => {
      await result.current.markRead('m1');
    });
    expect(markAnnouncementRead).toHaveBeenCalledWith('room1', 'm1', 'user1');
  });
});
