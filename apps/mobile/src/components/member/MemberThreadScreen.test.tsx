import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { ChatMessage, ChatRoom } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { MemberThreadScreen } from './MemberThreadScreen';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useAuth } from '../../lib/AuthProvider';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/useChatThreadData', () => ({ useChatThreadData: jest.fn() }));
jest.mock('../../lib/data/chat', () => ({}));
jest.mock('../../lib/data/todos', () => ({ addTodo: jest.fn() }));
jest.mock('../../lib/data/contacts', () => ({ subscribeContacts: jest.fn(() => () => {}) }));
jest.mock('../../lib/data/events', () => ({ subscribeEvents: jest.fn(() => () => {}) }));
jest.mock('../../lib/data/prayers', () => ({ subscribeAllPrayers: jest.fn(() => () => {}) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const base = { id: 'room1', memberIds: ['me', 'grace', 'maria'], createdById: 'grace', createdByName: 'Grace Liu', createdAt: hoursAgo(100) };
const group: ChatRoom = { ...base, type: 'group', name: 'Small group' };
const announcement: ChatRoom = { ...base, type: 'announcement', name: 'Everyone on Campus' };

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
const mine = msg('m1', { text: 'MINE', senderId: 'me', senderName: 'Sam Student', timestamp: hoursAgo(2) });
const post = msg('a1', { text: 'RETREAT-SIGNUPS', senderId: 'maria', senderName: 'Maria Santos' });

const data = (over: Record<string, unknown> = {}) => ({
  room: group,
  usersCache: {},
  users: [],
  messages: [],
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

const renderMember = async (over: Record<string, unknown> = {}) => {
  const d = data(over);
  (useAuth as jest.Mock).mockReturnValue({ uid: 'me', role: 'operator', user: { displayName: 'Sam Student' } });
  (useChatThreadData as jest.Mock).mockReturnValue(d);
  const utils = await render(
    <ThemeProvider>
      <MemberThreadScreen roomId="room1" />
    </ThemeProvider>,
  );
  return { ...utils, d };
};

beforeEach(() => jest.clearAllMocks());

describe('MemberThreadScreen', () => {
  it('draws rows, left-aligned, your own under your own name — the mine-on-the-right bubble is gone', async () => {
    const { getByText, toJSON } = await renderMember({ messages: [msg('g1'), mine] });
    expect(getByText('G1')).toBeTruthy();
    expect(getByText('MINE')).toBeTruthy();
    expect(getByText('Sam Student')).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toContain('"alignSelf":"flex-end"');
  });

  it('opens a Thread as a pushed screen, from a chip or a long-press', async () => {
    const reply = msg('r1', { parentId: 'g1', timestamp: hoursAgo(1) });
    const { getByRole, getByText } = await renderMember({ messages: [msg('g1'), reply] });
    await fireEvent.press(getByRole('button', { name: '1 reply' }));
    expect(mockPush).toHaveBeenLastCalledWith('/messages/room1/thread?parent=g1');
    await fireEvent(getByText('G1'), 'longPress');
    await fireEvent.press(getByRole('button', { name: 'Reply in thread' }));
    expect(mockPush).toHaveBeenLastCalledWith('/messages/room1/thread?parent=g1');
  });

  it('long-press offers Copy text but no to-do — a member has no to-do flow, and no Delete on another person’s', async () => {
    const { getByText, getByRole, queryByRole } = await renderMember({ messages: [msg('g1'), mine] });
    await fireEvent(getByText('G1'), 'longPress');
    expect(getByRole('button', { name: 'Copy text' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Make a to-do' })).toBeNull();
    expect(queryByRole('button', { name: 'Delete message' })).toBeNull();
  });

  it('lets a member take back their own message, after a confirm', async () => {
    const { getByText, getByRole, d } = await renderMember({ messages: [mine] });
    await fireEvent(getByText('MINE'), 'longPress');
    await fireEvent.press(getByRole('button', { name: 'Delete message' }));
    await fireEvent.press(getByRole('button', { name: 'Yes, remove it' }));
    expect(d.remove).toHaveBeenCalledWith('m1');
  });

  it('sends from the composer in a group', async () => {
    const { getByLabelText, getByRole, d } = await renderMember({ messages: [msg('g1')] });
    await fireEvent.changeText(getByLabelText('Message'), 'See you there');
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(d.send).toHaveBeenCalledWith('See you there');
  });

  describe('an announcement', () => {
    it('says Got it and opens the Thread to reply, each target at least 44px', async () => {
      const { getByRole, d } = await renderMember({ room: announcement, messages: [post] });
      const gotIt = getByRole('button', { name: 'Got it' });
      const reply = getByRole('button', { name: 'Reply in thread' });
      expect(StyleSheet.flatten(gotIt.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(StyleSheet.flatten(reply.props.style).minHeight).toBeGreaterThanOrEqual(44);
      await fireEvent.press(gotIt);
      expect(d.acknowledge).toHaveBeenCalledWith(post);
      await fireEvent.press(reply);
      expect(mockPush).toHaveBeenCalledWith('/messages/room1/thread?parent=a1');
    });

    it('says "You said got it" when you have', async () => {
      const { getByRole } = await renderMember({ room: announcement, messages: [{ ...post, acknowledged: ['me'] }] });
      expect(getByRole('button', { name: 'You said got it' })).toBeTruthy();
    });

    it("can't post top-level: the footer stands where the composer was, and no false 'replies go to the team' note", async () => {
      const { getByText, queryByLabelText, queryByText } = await renderMember({ room: announcement, messages: [post] });
      expect(queryByLabelText('Message')).toBeNull();
      expect(getByText('Only Full-timers post here. Anyone can reply in a thread.')).toBeTruthy();
      expect(queryByText(/Replies happen in threads on the web/)).toBeNull();
      expect(queryByText(/replies go to the team directly/i)).toBeNull();
    });

    it('holds the pinned post first', async () => {
      const older = msg('a0', { text: 'OLDER-POST', senderId: 'maria', timestamp: hoursAgo(40) });
      const pinned = msg('a2', { text: 'PINNED-POST', senderId: 'grace', pinned: true, pinnedBy: 'grace', timestamp: hoursAgo(2) });
      const { getByText, toJSON } = await renderMember({ room: announcement, messages: [older, pinned, post] });
      expect(getByText('Pinned by Grace Liu · stays at the top until they unpin it')).toBeTruthy();
      const text = JSON.stringify(toJSON());
      expect(text.indexOf('PINNED-POST')).toBeLessThan(text.indexOf('OLDER-POST'));
    });
  });
});
