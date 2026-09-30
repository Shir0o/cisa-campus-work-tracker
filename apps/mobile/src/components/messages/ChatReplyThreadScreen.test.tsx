import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { ChatMessage, ChatRoom } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ChatReplyThreadScreen } from './ChatReplyThreadScreen';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useAuth } from '../../lib/AuthProvider';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/useChatThreadData', () => ({ useChatThreadData: jest.fn() }));
jest.mock('../../lib/data/chat', () => ({}));
jest.mock('../../lib/data/todos', () => ({ addTodo: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
}));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const base = { id: 'room1', memberIds: ['me', 'grace', 'maria'], createdById: 'grace', createdByName: 'Grace Liu', createdAt: hoursAgo(100) };
const group: ChatRoom = { ...base, type: 'group', name: 'Welcome team' };
const announcement: ChatRoom = { ...base, type: 'announcement', name: 'Campus Updates' };

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  roomId: 'room1',
  text: id.toUpperCase(),
  senderId: 'grace',
  senderName: 'Grace Liu',
  timestamp: hoursAgo(3),
  type: 'text',
  ...over,
});
const parent = msg('p1', { text: 'CAN-YOU-COVER' });
const r1 = msg('r1', { text: 'PERFECT', parentId: 'p1', senderId: 'maria', senderName: 'Maria Santos', timestamp: hoursAgo(2) });
const r2 = msg('r2', { text: 'I-CAN-DRIVE', parentId: 'p1', senderId: 'me', senderName: 'Me Myself', timestamp: hoursAgo(1) });
const other = msg('o1', { text: 'NOT-IN-THREAD', timestamp: hoursAgo(1) });

const data = (over: Record<string, unknown> = {}) => ({
  room: group,
  usersCache: {},
  users: [],
  messages: [parent, r1, r2, other],
  lastReadAt: null,
  partnerContactId: null,
  loading: false,
  error: null,
  send: jest.fn(),
  acknowledge: jest.fn(),
  pin: jest.fn(),
  remove: jest.fn(),
  ...over,
});

const renderThread = async (role: string, over: Record<string, unknown> = {}, parentId = 'p1') => {
  const d = data(over);
  (useAuth as jest.Mock).mockReturnValue({ uid: 'me', role, user: { displayName: 'Me Myself' } });
  (useChatThreadData as jest.Mock).mockReturnValue(d);
  const utils = await render(
    <ThemeProvider>
      <ChatReplyThreadScreen roomId="room1" parentId={parentId} />
    </ThemeProvider>,
  );
  return { ...utils, d };
};

beforeEach(() => jest.clearAllMocks());

describe('a chat Thread on the phone (#1262)', () => {
  it('is a pushed screen headed "Thread" and the room, with a back control to the room', async () => {
    const { getByText, getAllByText, getByRole } = await renderThread('manager');
    expect(getByText('Thread')).toBeTruthy();
    expect(getAllByText('Welcome team').length).toBeGreaterThan(0);
    await fireEvent.press(getByRole('button', { name: 'Back to Welcome team' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('puts the parent on top, then the count, then the replies — and nothing else from the room', async () => {
    const { getByText, queryByText, toJSON } = await renderThread('manager');
    expect(getByText('2 replies')).toBeTruthy();
    expect(queryByText('NOT-IN-THREAD')).toBeNull();
    const text = JSON.stringify(toJSON());
    expect(text.indexOf('CAN-YOU-COVER')).toBeLessThan(text.indexOf('2 replies'));
    expect(text.indexOf('2 replies')).toBeLessThan(text.indexOf('PERFECT'));
    expect(text.indexOf('PERFECT')).toBeLessThan(text.indexOf('I-CAN-DRIVE'));
  });

  it('replies to the parent, one level deep', async () => {
    const { getByLabelText, getByRole, d } = await renderThread('manager');
    await fireEvent.changeText(getByLabelText('Reply in thread'), 'Count me in');
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(d.send).toHaveBeenCalledWith('Count me in', 'p1');
  });

  it('offers no Reply in thread on a row already in a Thread', async () => {
    const { getByText, getByRole, queryByRole } = await renderThread('manager');
    await fireEvent(getByText('PERFECT'), 'longPress');
    expect(getByRole('button', { name: 'Copy text' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Reply in thread' })).toBeNull();
  });

  it('says the message is gone once its parent no longer exists', async () => {
    const { getByText, queryByLabelText } = await renderThread('manager', {}, 'missing');
    expect(getByText('This message is gone.')).toBeTruthy();
    expect(queryByLabelText('Reply in thread')).toBeNull();
  });

  describe('in an announcement, as a member', () => {
    const post = msg('p1', { text: 'RETREAT-SIGNUPS', senderId: 'maria', senderName: 'Maria Santos' });

    it('can say Got it on the post from its Thread', async () => {
      const { getByRole, d } = await renderThread('operator', { room: announcement, messages: [post] });
      await fireEvent.press(getByRole('button', { name: 'Got it' }));
      expect(d.acknowledge).toHaveBeenCalledWith(post);
    });

    it('can reply, though they cannot post top-level', async () => {
      const { getByLabelText, getByRole, d } = await renderThread('operator', { room: announcement, messages: [post] });
      await fireEvent.changeText(getByLabelText('Reply in thread'), 'Can I bring a friend?');
      await fireEvent.press(getByRole('button', { name: 'Send' }));
      expect(d.send).toHaveBeenCalledWith('Can I bring a friend?', 'p1');
    });

    it('cannot reply if they are not in the room', async () => {
      const { queryByLabelText } = await renderThread('operator', {
        room: { ...announcement, memberIds: ['grace'] },
        messages: [post],
      });
      expect(queryByLabelText('Reply in thread')).toBeNull();
    });
  });
});
