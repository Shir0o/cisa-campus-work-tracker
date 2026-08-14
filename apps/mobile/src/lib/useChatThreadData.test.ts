// The hooks must drop stale content the moment the signed-in identity changes —
// that is exactly the impersonation ("See it as they do") flash: the previous
// viewer's messages stay rendered until the new subscription's first snapshot
// lands. The reset is synchronous (a render-phase state adjustment), so the
// assertions below run against the very first post-change render.
import { act, renderHook } from '@testing-library/react-native';
import { useChatThreadData } from './useChatThreadData';

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
}));

jest.mock('./data/users', () => ({
  subscribeUsers: () => () => undefined,
}));

jest.mock('./data/contacts', () => ({
  subscribeContacts: () => () => undefined,
}));

jest.mock('./data/chatReads', () => ({
  ChatReads: { markRead: jest.fn(), getLastRead: () => null },
}));

jest.mock('./firebase', () => ({
  handleFirestoreError: jest.fn(),
  OperationType: { LIST: 'list' },
}));

const authState: TestState = { uid: 'user1', user: null };
const cbs: TestCbs = {};
(globalThis as unknown as { __cisaAuth: TestState }).__cisaAuth = authState;
(globalThis as unknown as { __chatThreadCbs: TestCbs }).__chatThreadCbs = cbs;

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
    authState.uid = 'user1';
    delete cbs.room;
    delete cbs.messages;
  });

  it('clears stale messages and returns to loading when the uid changes', () => {
    const { result, rerender } = renderHook(({ roomId }: { roomId: string }) => useChatThreadData(roomId), {
      initialProps: { roomId: 'room1' },
    });

    act(() => {
      emitMessages([message('m1')]);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.dayGroups[0].messages).toHaveLength(1);

    authState.uid = 'user2';
    rerender({ roomId: 'room1' });

    expect(result.current.loading).toBe(true);
    expect(result.current.dayGroups).toHaveLength(0);
    expect(result.current.room).toBeNull();
  });

  it('clears stale messages and returns to loading when the room changes', () => {
    const { result, rerender } = renderHook(({ roomId }: { roomId: string }) => useChatThreadData(roomId), {
      initialProps: { roomId: 'room1' },
    });

    act(() => {
      emitMessages([message('m1')]);
    });
    expect(result.current.dayGroups[0].messages).toHaveLength(1);

    rerender({ roomId: 'room2' });

    expect(result.current.loading).toBe(true);
    expect(result.current.dayGroups).toHaveLength(0);
  });
});
