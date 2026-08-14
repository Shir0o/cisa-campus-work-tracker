// Same impersonation-flash guard as useChatThreadData.test.ts: the room list
// must reset synchronously when the identity changes.
import { act, renderHook } from '@testing-library/react-native';
import { useMessagesData } from './useMessagesData';

type TestState = { uid: string | null; user: null };
type TestCbs = Record<string, unknown>;

jest.mock('./AuthProvider', () => ({
  useAuth: () => (globalThis as unknown as { __cisaAuth: TestState }).__cisaAuth,
}));

jest.mock('./data/chat', () => ({
  subscribeChatRooms: (uid: string, cb: (rooms: unknown[]) => void) => {
    (globalThis as unknown as { __messagesCbs: TestCbs }).__messagesCbs[uid] = cb;
    return () => undefined;
  },
}));

jest.mock('./data/users', () => ({
  subscribeUsers: () => () => undefined,
}));

jest.mock('./data/chatReads', () => ({
  useChatReads: () => ({ getLastRead: () => null }),
}));

jest.mock('./firebase', () => ({
  handleFirestoreError: jest.fn(),
  OperationType: { LIST: 'list' },
}));

const authState: TestState = { uid: 'user1', user: null };
const cbs: TestCbs = {};
(globalThis as unknown as { __cisaAuth: TestState }).__cisaAuth = authState;
(globalThis as unknown as { __messagesCbs: TestCbs }).__messagesCbs = cbs;

const room = (id: string) => ({
  id,
  type: 'group',
  name: 'Roomies',
  memberIds: ['user1', 'user2'],
  createdAt: new Date().toISOString(),
});

describe('useMessagesData', () => {
  beforeEach(() => {
    authState.uid = 'user1';
    delete cbs.user1;
    delete cbs.user2;
  });

  it('clears stale rooms and returns to loading when the uid changes', () => {
    const { result, rerender } = renderHook((_props: { ignored?: boolean }) => useMessagesData(), {
      initialProps: {},
    });

    act(() => {
      (cbs.user1 as (rooms: unknown[]) => void)([room('r1')]);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.rooms).toHaveLength(1);

    authState.uid = 'user2';
    rerender({});

    expect(result.current.loading).toBe(true);
    expect(result.current.rooms).toHaveLength(0);
  });
});
