import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { ChatMessage, ChatRoom } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ChatThreadScreen } from './ChatThreadScreen';
import { useChatThreadData } from '../../lib/useChatThreadData';
import { useAuth } from '../../lib/AuthProvider';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/useChatThreadData', () => ({ useChatThreadData: jest.fn() }));
jest.mock('../../lib/data/chat', () => ({}));
jest.mock('../../lib/data/todos', () => ({ addTodo: jest.fn().mockResolvedValue('t1') }));
jest.mock('../../lib/data/contacts', () => ({
  subscribeContacts: jest.fn((cb: (list: unknown[]) => void) => {
    cb([{ id: 'c1', name: 'Daniel Reyes', role: 'Student', location: 'UCLA' }]);
    return () => {};
  }),
}));
jest.mock('../../lib/data/events', () => ({ subscribeEvents: jest.fn(() => () => {}) }));
jest.mock('../../lib/data/prayers', () => ({ subscribeAllPrayers: jest.fn(() => () => {}) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('../ft/FtTodoSheet', () => {
  const { Text } = require('react-native');
  return { FtTodoSheet: ({ visible, initialTitle }: any) => (visible ? <Text testID="todo-sheet">{initialTitle}</Text> : null) };
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const base = { id: 'room1', memberIds: ['user1', 'grace', 'maria'], createdById: 'grace', createdByName: 'Grace Liu', createdAt: hoursAgo(100) };
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
const graceSays = msg('g1', { text: 'CAN-YOU-COVER' });
const mine = msg('m1', { text: 'MINE', senderId: 'user1', senderName: 'Tony Wang', timestamp: hoursAgo(2) });

const data = (overrides: Record<string, unknown> = {}) => ({
  room: null,
  usersCache: {},
  users: [],
  messages: [],
  lastReadAt: null,
  partnerContactId: null,
  loading: true,
  error: null,
  send: jest.fn(),
  acknowledge: jest.fn(),
  markRead: jest.fn(),
  pin: jest.fn(),
  remove: jest.fn(),
  ...overrides,
});

const renderAs = async (auth: { uid: string; role: string }, over: Record<string, unknown>) => {
  const d = data({ loading: false, room: group, ...over });
  (useAuth as jest.Mock).mockReturnValue({ user: { displayName: 'Tony Wang' }, ...auth });
  (useChatThreadData as jest.Mock).mockReturnValue(d);
  const utils = await render(
    <ThemeProvider>
      <ChatThreadScreen roomId="room1" />
    </ThemeProvider>,
  );
  return { ...utils, d };
};
const trainee = { uid: 'user1', role: 'manager' };
const fullTimer = { uid: 'user1', role: 'admin' };

beforeEach(() => jest.clearAllMocks());

describe('ChatThreadScreen', () => {
  it('shows the thread skeleton while data is loading', async () => {
    const { getByTestId, queryByTestId } = await renderAs(trainee, { loading: true, room: null });
    expect(getByTestId('thread-skeleton')).toBeTruthy();
    expect(queryByTestId('activity-indicator')).toBeNull();
  });

  it('shows the empty state instead of stale content once loading settles', async () => {
    const { getByText, queryByTestId } = await renderAs(trainee, { room: null });
    expect(queryByTestId('thread-skeleton')).toBeNull();
    expect(getByText('Nothing here yet. Send one to start it off.')).toBeTruthy();
  });

  describe('rows (G1–G5)', () => {
    it('are left-aligned, your own under your own name — no bubble on the right (G3)', async () => {
      const { getByText, toJSON } = await renderAs(trainee, { messages: [graceSays, mine] });
      expect(getByText('CAN-YOU-COVER')).toBeTruthy();
      expect(getByText('MINE')).toBeTruthy();
      expect(getByText('Tony Wang')).toBeTruthy();
      expect(JSON.stringify(toJSON())).not.toContain('"alignSelf":"flex-end"');
    });

    it('continues a burst from one author without repeating the name (G2)', async () => {
      const second = msg('g2', { text: 'SECOND', timestamp: new Date(Date.parse(graceSays.timestamp as string) + 60_000).toISOString() });
      const { getAllByText } = await renderAs(trainee, { messages: [graceSays, second] });
      expect(getAllByText('Grace Liu')).toHaveLength(1);
    });

    it('divides the days (G5)', async () => {
      // Anchored to now, not a fixed hour offset: "Today"/"Yesterday" are
      // calendar labels, and a fixed offset lands on the wrong day when the
      // suite runs near midnight.
      const yesterday = msg('y1', { text: 'YESTERDAY-MSG', timestamp: hoursAgo(24) });
      const today = msg('t1', { text: 'TODAY-MSG', senderId: 'user1', senderName: 'Tony Wang', timestamp: new Date().toISOString() });
      const { getByText } = await renderAs(trainee, { messages: [yesterday, today] });
      expect(getByText('Yesterday')).toBeTruthy();
      expect(getByText('Today')).toBeTruthy();
    });

    it("draws a New line at the first message after the room's last-read (G6)", async () => {
      const old = msg('old', { text: 'OLD-ONE', timestamp: hoursAgo(10) });
      const { getByText, toJSON } = await renderAs(trainee, { messages: [old, graceSays], lastReadAt: hoursAgo(5) });
      const text = JSON.stringify(toJSON());
      expect(getByText('New')).toBeTruthy();
      expect(text.indexOf('OLD-ONE')).toBeLessThan(text.indexOf('"New"'));
      expect(text.indexOf('"New"')).toBeLessThan(text.indexOf('CAN-YOU-COVER'));
    });

    it("shows a sender's photo, with initials when there is none", async () => {
      const withPhoto = msg('p1', { senderPhoto: 'https://x/grace.png' });
      const { getByLabelText } = await renderAs(trainee, { messages: [withPhoto] });
      expect(getByLabelText('Grace Liu photo')).toBeTruthy();
    });

    it('picks out an @mention of someone in the room, typed in full or by first name', async () => {
      const says = msg('t1', { text: 'Thanks @grace and @Maria Santos' });
      const { getByText } = await renderAs(trainee, {
        messages: [says],
        usersCache: { grace: { displayName: 'Grace Liu' }, maria: { displayName: 'Maria Santos' } },
      });
      expect(getByText('@grace')).toBeTruthy();
      expect(getByText('@Maria Santos')).toBeTruthy();
    });

    it('draws a system notice centred, not as a message', async () => {
      const notice = msg('n1', { type: 'system', senderName: 'System', senderId: 'user1', text: 'Tony created group "Welcome team"' });
      const { getByText, queryByText } = await renderAs(trainee, { messages: [notice] });
      expect(getByText('Tony created group "Welcome team"')).toBeTruthy();
      expect(queryByText('System')).toBeNull();
    });

    it('says a message was taken back, in its place', async () => {
      const gone = msg('x1', { deleted: { by: 'grace', at: hoursAgo(1) } });
      const { getByText, queryByText } = await renderAs(trainee, { messages: [gone] });
      expect(getByText('Grace took this message back.')).toBeTruthy();
      expect(queryByText('X1')).toBeNull();
    });
  });

  describe('the room header (S5)', () => {
    const roster = [
      { uid: 'user1', displayName: 'Tony Wang', role: 'manager' },
      { uid: 'grace', displayName: 'Grace Liu', role: 'admin' },
      { uid: 'maria', displayName: 'Maria Santos', role: 'admin' },
    ];
    const names = { grace: { displayName: 'Grace Liu' }, maria: { displayName: 'Maria Santos' } };

    it('counts a group', async () => {
      const { getByText } = await renderAs(trainee, { room: group, messages: [graceSays] });
      expect(getByText('Group · 3 people')).toBeTruthy();
    });

    it('says "Just the two of you" in a direct chat', async () => {
      const direct: ChatRoom = { ...base, type: 'direct', memberIds: ['user1', 'grace'] };
      const { getByText } = await renderAs(trainee, { room: direct, messages: [graceSays] });
      expect(getByText('Just the two of you')).toBeTruthy();
    });

    it('names who posts in an announcement for a Trainee', async () => {
      const { getByText } = await renderAs(trainee, {
        room: announcement,
        messages: [msg('a1', { senderId: 'grace' })],
        users: roster,
        usersCache: names,
      });
      expect(getByText('Announcement · 3 people · Grace and Maria post here')).toBeTruthy();
    });

    it('leads with "you" for a Full-timer', async () => {
      const { getByText } = await renderAs(fullTimer, {
        room: announcement,
        messages: [msg('a1', { senderId: 'grace' })],
        users: roster,
        usersCache: names,
      });
      expect(getByText('Announcement · 3 people · you and 2 others post here')).toBeTruthy();
    });
  });

  describe('Threads (T1, T2)', () => {
    const reply = msg('r1', { parentId: 'g1', senderId: 'maria', senderName: 'Maria Santos', timestamp: hoursAgo(1) });

    it('puts a chip on a parent and opens its Thread as a pushed screen', async () => {
      const { getByRole } = await renderAs(trainee, { messages: [graceSays, reply] });
      await fireEvent.press(getByRole('button', { name: '1 reply' }));
      expect(mockPush).toHaveBeenCalledWith('/messages/room1/thread?parent=g1');
    });

    it('keeps a reply out of the stream', async () => {
      const { queryByText } = await renderAs(trainee, { messages: [graceSays, reply] });
      expect(queryByText('R1')).toBeNull();
    });
  });

  describe('long-press (G7)', () => {
    it('opens Reply in thread, Make a to-do and Copy text — and Delete only for the author or a Full-timer', async () => {
      const { getByText, getByRole, queryByRole } = await renderAs(trainee, { messages: [graceSays, mine] });
      await fireEvent(getByText('CAN-YOU-COVER'), 'longPress');
      expect(getByRole('button', { name: 'Reply in thread' })).toBeTruthy();
      expect(getByRole('button', { name: 'Make a to-do' })).toBeTruthy();
      expect(getByRole('button', { name: 'Copy text' })).toBeTruthy();
      expect(queryByRole('button', { name: 'Delete message' })).toBeNull();
    });

    it("lets a Full-timer delete anyone's message, after one confirm", async () => {
      const { getByText, getByRole, d } = await renderAs(fullTimer, { messages: [graceSays] });
      await fireEvent(getByText('CAN-YOU-COVER'), 'longPress');
      await fireEvent.press(getByRole('button', { name: 'Delete message' }));
      expect(d.remove).not.toHaveBeenCalled();
      expect(getByText(/Take this back for everyone/)).toBeTruthy();
      await fireEvent.press(getByRole('button', { name: 'Yes, remove it' }));
      expect(d.remove).toHaveBeenCalledWith('g1');
    });

    it('keeps the message when the confirm is declined', async () => {
      const { getByText, getByRole, d } = await renderAs(trainee, { messages: [mine] });
      await fireEvent(getByText('MINE'), 'longPress');
      await fireEvent.press(getByRole('button', { name: 'Delete message' }));
      await fireEvent.press(getByRole('button', { name: 'Keep it' }));
      expect(d.remove).not.toHaveBeenCalled();
    });

    it('will not delete a parent whose replies remain', async () => {
      const reply = msg('r1', { parentId: 'm1', timestamp: hoursAgo(1) });
      const { getByText, queryByRole } = await renderAs(fullTimer, { messages: [mine, reply] });
      await fireEvent(getByText('MINE'), 'longPress');
      expect(queryByRole('button', { name: 'Delete message' })).toBeNull();
    });

    it('opens the Thread for Reply in thread', async () => {
      const { getByText, getByRole } = await renderAs(trainee, { messages: [graceSays] });
      await fireEvent(getByText('CAN-YOU-COVER'), 'longPress');
      await fireEvent.press(getByRole('button', { name: 'Reply in thread' }));
      expect(mockPush).toHaveBeenCalledWith('/messages/room1/thread?parent=g1');
    });

    it('starts a to-do from the message', async () => {
      const { getByText, getByRole, getByTestId } = await renderAs(trainee, { messages: [graceSays] });
      await fireEvent(getByText('CAN-YOU-COVER'), 'longPress');
      await fireEvent.press(getByRole('button', { name: 'Make a to-do' }));
      expect(getByTestId('todo-sheet').props.children).toBe('CAN-YOU-COVER');
    });

    it('copies the text', async () => {
      const Clipboard = require('expo-clipboard');
      const { getByText, getByRole } = await renderAs(trainee, { messages: [graceSays] });
      await fireEvent(getByText('CAN-YOU-COVER'), 'longPress');
      await fireEvent.press(getByRole('button', { name: 'Copy text' }));
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('CAN-YOU-COVER');
    });

    it('does not offer Pin outside an announcement', async () => {
      const { getByText, queryByRole } = await renderAs(fullTimer, { messages: [graceSays] });
      await fireEvent(getByText('CAN-YOU-COVER'), 'longPress');
      expect(queryByRole('button', { name: 'Pin' })).toBeNull();
    });
  });

  describe('composer (C3, C4, C5)', () => {
    it('sends into the room', async () => {
      const { getByLabelText, getByRole, d } = await renderAs(trainee, { messages: [graceSays] });
      await fireEvent.changeText(getByLabelText('Message'), 'Yes, I can');
      await fireEvent.press(getByRole('button', { name: 'Send' }));
      expect(d.send).toHaveBeenCalledWith('Yes, I can');
    });

    it("offers the chat's members as @mention candidates (ADR 0007)", async () => {
      const { getByLabelText } = await renderAs(trainee, {
        messages: [graceSays],
        usersCache: { grace: { displayName: 'Grace Liu' }, maria: { displayName: 'Maria Santos' } },
      });
      const input = getByLabelText('Message');
      await fireEvent.changeText(input, '@Gra');
      await fireEvent(input, 'selectionChange', { nativeEvent: { selection: { start: 4, end: 4 } } });
      expect(getByLabelText('@Grace Liu')).toBeTruthy();
    });

    it('stages a contact card, then posts it under the message (C5)', async () => {
      const { getByLabelText, getByText, getByRole, d } = await renderAs(trainee, { messages: [graceSays] });
      await fireEvent.press(getByLabelText('Attach'));
      await fireEvent.press(getByText('Daniel Reyes'));
      await fireEvent.changeText(getByLabelText('Message'), 'Meet Daniel');
      await fireEvent.press(getByRole('button', { name: 'Send' }));
      expect(d.send).toHaveBeenCalledWith('Meet Daniel', null, [
        { type: 'contact', id: 'c1', name: 'Daniel Reyes', subtitle: 'Student' },
      ]);
    });

    it('removes a staged card before sending, so it is not posted', async () => {
      const { getByLabelText, getByText, getByRole, d } = await renderAs(trainee, { messages: [graceSays] });
      await fireEvent.press(getByLabelText('Attach'));
      await fireEvent.press(getByText('Daniel Reyes'));
      await fireEvent.press(getByLabelText('Remove Daniel Reyes'));
      await fireEvent.changeText(getByLabelText('Message'), 'Never mind');
      await fireEvent.press(getByRole('button', { name: 'Send' }));
      expect(d.send).toHaveBeenCalledWith('Never mind');
    });
  });

  it('shows an attached contact card under a message, for members too', async () => {
    const withCard = msg('a1', { text: 'MEET-HIM', attachments: [{ type: 'contact', id: 'c1', name: 'Daniel Reyes' }] });
    const { getByText } = await renderAs(trainee, { messages: [withCard] });
    expect(getByText('Daniel Reyes')).toBeTruthy();
  });

  describe('an announcement', () => {
    const post = msg('a1', { text: 'RETREAT-SIGNUPS', senderId: 'maria', senderName: 'Maria Santos', acknowledged: [] });

    it('gives a Trainee Got it and Reply in thread on each post, both 44px', async () => {
      const { getByRole, d } = await renderAs(trainee, { room: announcement, messages: [post] });
      const gotIt = getByRole('button', { name: 'Got it' });
      const reply = getByRole('button', { name: 'Reply in thread' });
      expect(StyleSheet.flatten(gotIt.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(StyleSheet.flatten(reply.props.style).minHeight).toBeGreaterThanOrEqual(44);
      await fireEvent.press(gotIt);
      expect(d.acknowledge).toHaveBeenCalledWith(post);
      await fireEvent.press(reply);
      expect(mockPush).toHaveBeenCalledWith('/messages/room1/thread?parent=a1');
    });

    it('says "You said got it" once you have, and the chip takes the place of Reply once it has replies', async () => {
      const acked = { ...post, acknowledged: ['user1'] };
      const reply = msg('r1', { parentId: 'a1', timestamp: hoursAgo(1) });
      const { getByRole, queryByRole } = await renderAs(trainee, { room: announcement, messages: [acked, reply] });
      expect(getByRole('button', { name: 'You said got it' })).toBeTruthy();
      expect(getByRole('button', { name: '1 reply' })).toBeTruthy();
      expect(queryByRole('button', { name: 'Reply in thread' })).toBeNull();
    });

    it("has no Got it on your own post", async () => {
      const ownPost = msg('a2', { senderId: 'user1', senderName: 'Tony Wang' });
      const { queryByRole } = await renderAs(fullTimer, { room: announcement, messages: [ownPost] });
      expect(queryByRole('button', { name: 'Got it' })).toBeNull();
    });

    it("can't post top-level as a Trainee: the composer gives way to the footer", async () => {
      const { getByText, queryByLabelText } = await renderAs(trainee, { room: announcement, messages: [post] });
      expect(queryByLabelText('Message')).toBeNull();
      expect(getByText('Only Full-timers post here. Anyone can reply in a thread.')).toBeTruthy();
    });

    it('lets a Full-timer post, saying who will read it', async () => {
      const { getByLabelText, getByText, d, getByRole } = await renderAs(fullTimer, { room: announcement, messages: [post] });
      expect(getByText('Posting to 3 people in this channel')).toBeTruthy();
      await fireEvent.changeText(getByLabelText('Message'), 'New time');
      await fireEvent.press(getByRole('button', { name: 'Send' }));
      expect(d.send).toHaveBeenCalledWith('New time');
    });

    it('names the real audience for the "everyone" preset (C3)', async () => {
      const everyone: ChatRoom = { ...announcement, audiencePreset: 'everyone' };
      const { getByText } = await renderAs(fullTimer, { room: everyone, messages: [post] });
      expect(getByText('Posting to everyone on Campus — 3 people')).toBeTruthy();
    });

    it('says "in this channel" for the "custom" preset (C3)', async () => {
      const custom: ChatRoom = { ...announcement, audiencePreset: 'custom' };
      const { getByText } = await renderAs(fullTimer, { room: custom, messages: [post] });
      expect(getByText('Posting to 3 people in this channel')).toBeTruthy();
    });

    it('holds the pinned post first, under its strip, though it is not the oldest', async () => {
      const older = msg('a8', { text: 'OLDER-POST', senderId: 'maria', timestamp: hoursAgo(40) });
      const pinned = msg('a0', { text: 'PINNED-POST', senderId: 'grace', pinned: true, pinnedBy: 'maria', timestamp: hoursAgo(2) });
      const newer = msg('a9', { text: 'NEWER-POST', senderId: 'maria', timestamp: hoursAgo(1) });
      const { getByText, toJSON } = await renderAs(trainee, {
        room: announcement,
        messages: [older, pinned, newer],
        usersCache: { maria: { displayName: 'Maria Santos' } },
      });
      expect(getByText('Pinned by Maria Santos · stays at the top until they unpin it')).toBeTruthy();
      const text = JSON.stringify(toJSON());
      expect(text.indexOf('PINNED-POST')).toBeLessThan(text.indexOf('OLDER-POST'));
      expect(text.indexOf('OLDER-POST')).toBeLessThan(text.indexOf('NEWER-POST'));
    });

    it('badges a Full-timer post', async () => {
      const { getByText } = await renderAs(trainee, { room: announcement, messages: [post] });
      expect(getByText('Full-timer')).toBeTruthy();
    });

    it('offers Pin on a post, and Unpin on the pinned one', async () => {
      const pinned = msg('a0', { text: 'PINNED-POST', pinned: true, pinnedBy: 'maria' });
      const { getByText, getByRole, d } = await renderAs(fullTimer, { room: announcement, messages: [post, pinned] });
      await fireEvent(getByText('RETREAT-SIGNUPS'), 'longPress');
      await fireEvent.press(getByRole('button', { name: 'Pin' }));
      expect(d.pin).toHaveBeenCalledWith('a1', true);
      await fireEvent(getByText('PINNED-POST'), 'longPress');
      await fireEvent.press(getByRole('button', { name: 'Unpin' }));
      expect(d.pin).toHaveBeenCalledWith('a0', false);
    });
  });

  describe('read-on-view and receipts (#1277)', () => {
    const announced = (id: string, over: Partial<ChatMessage> = {}) =>
      msg(id, { text: `POST-${id}`, senderId: 'maria', senderName: 'Maria Santos', acknowledged: [], ...over });

    const layout = async (getByText: (t: string) => unknown, text: string, y: number, height = 100) =>
      fireEvent(await getByText(text) as never, 'layout', { nativeEvent: { layout: { y, height } } });
    const scroll = async (getByTestId: (t: string) => unknown, y: number, height = 400) =>
      fireEvent.scroll(await getByTestId('chat-stream') as never, { nativeEvent: { contentOffset: { y }, layoutMeasurement: { height } } });

    it('marks nothing read when the room loads', async () => {
      const { d } = await renderAs(trainee, { room: announcement, messages: [announced('a1'), announced('a2')] });
      expect(d.markRead).not.toHaveBeenCalled();
    });

    it('marks only the post scrolled into view, and only once', async () => {
      const { getByText, getByTestId, d } = await renderAs(trainee, {
        room: announcement,
        messages: [announced('a1'), announced('a2')],
      });
      await layout(getByText, 'POST-a1', 0);
      await layout(getByText, 'POST-a2', 120);
      await scroll(getByTestId, 100);
      expect(d.markRead).toHaveBeenCalledTimes(1);
      expect(d.markRead).toHaveBeenCalledWith('a2');
      await scroll(getByTestId, 100);
      expect(d.markRead).toHaveBeenCalledTimes(1);
    });

    it('never writes a post the viewer has already read', async () => {
      const { getByText, getByTestId, d } = await renderAs(trainee, {
        room: announcement,
        messages: [announced('a1', { readBy: ['user1'] }), announced('a2')],
      });
      await layout(getByText, 'POST-a1', 0);
      await layout(getByText, 'POST-a2', 120);
      await scroll(getByTestId, 0);
      expect(d.markRead).toHaveBeenCalledTimes(1);
      expect(d.markRead).toHaveBeenCalledWith('a2');
    });

    it('gives a member Got it and Reply in thread, but no receipts (S4)', async () => {
      const { getByRole, queryByText } = await renderAs(trainee, { room: announcement, messages: [announced('a1')] });
      expect(getByRole('button', { name: 'Got it' })).toBeTruthy();
      expect(getByRole('button', { name: 'Reply in thread' })).toBeTruthy();
      expect(queryByText(/Read by/)).toBeNull();
    });

    it('shows a Full-timer the receipts link, opening the read / not-yet list (S4)', async () => {
      const post = announced('a1', { readBy: ['maria', 'grace'], acknowledged: ['maria'] });
      const { getByRole, getByText, getAllByText } = await renderAs(fullTimer, {
        room: announcement,
        messages: [post],
        usersCache: { maria: { displayName: 'Maria Santos' }, grace: { displayName: 'Grace Liu' } },
      });
      await fireEvent.press(getByRole('button', { name: 'Read by 2 of 3 · 1 said got it' }));
      expect(getByText('Read receipts')).toBeTruthy();
      expect(getByText('2 / 3 read')).toBeTruthy();
      expect(getAllByText('Maria Santos').length).toBeGreaterThanOrEqual(1);
      expect(getByText('Grace Liu')).toBeTruthy();
      expect(getByText('You')).toBeTruthy();
    });
  });

  it('opens a direct chat partner’s page from the card above the stream', async () => {
    const { getByText } = await renderAs(trainee, { room: { ...base, type: 'direct', memberIds: ['user1', 'grace'] }, usersCache: { grace: { displayName: 'Grace Liu' } }, partnerContactId: 'c9', messages: [graceSays] });
    await fireEvent.press(getByText('Tap to view profile →'));
    expect(mockPush).toHaveBeenCalledWith('/contact/c9');
  });
});
