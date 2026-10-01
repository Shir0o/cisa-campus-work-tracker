import { describe, it, expect } from 'vitest';
import {
  announcementCreatedSystemMessage,
  canPostToRoom,
  canRemoveConvForEveryone,
  getDirectChatId,
  getRoomName,
  getRoomPhoto,
  isAnnouncement,
  isRoomUnread,
  sortRoomsByRecency,
  filterRooms,
  filterChatUsers,
  groupMessagesByDay,
  messagePreviewText,
  groupCreatedSystemMessage,
  membersAddedSystemMessage,
  memberLeftSystemMessage,
  chatRowPreview,
  chatKindNote,
  chatRoomSubtitle,
  announcementAudienceNote,
  messagesScreenNote,
  convTopLevel,
  convReplies,
  convReplyCount,
  convRepliers,
  convLastReply,
  type ChatUserSummary,
} from '../src/chat';
import type { AppUser, ChatMessage, ChatRoom } from '../src/types';

const NOW = new Date('2026-07-13T12:00:00Z').getTime();

const room = (overrides: Partial<ChatRoom> = {}): ChatRoom => ({
  id: 'r1',
  type: 'direct',
  memberIds: ['me', 'them'],
  createdById: 'me',
  createdByName: 'Me',
  createdAt: new Date(NOW - 100_000).toISOString(),
  ...overrides,
});

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  roomId: 'r1',
  text: 'hi',
  senderId: 'them',
  senderName: 'Them',
  timestamp: new Date(NOW).toISOString(),
  type: 'text',
  ...overrides,
});

const appUser = (overrides: Partial<AppUser> = {}): AppUser => ({
  uid: 'u1',
  email: 'user@example.com',
  displayName: 'User One',
  photoURL: '',
  approved: true,
  role: 'viewer',
  ...overrides,
});

describe('getDirectChatId', () => {
  it('sorts uids regardless of argument order', () => {
    expect(getDirectChatId('uidB', 'uidA')).toBe('direct_uidA_uidB');
    expect(getDirectChatId('uidA', 'uidB')).toBe('direct_uidA_uidB');
  });
});

describe('getRoomName', () => {
  const usersCache: Record<string, ChatUserSummary> = { them: { displayName: 'Them Person' } };

  it('returns the group name, falling back to "Group"', () => {
    expect(getRoomName(room({ type: 'group', name: 'Outreach Team' }), 'me', {})).toBe('Outreach Team');
    expect(getRoomName(room({ type: 'group', name: '' }), 'me', {})).toBe('Group');
  });

  it('returns the announcement name, falling back to "Announcement"', () => {
    expect(getRoomName(room({ type: 'announcement', name: 'Weekly notes' }), 'me', {})).toBe('Weekly notes');
    expect(getRoomName(room({ type: 'announcement' }), 'me', {})).toBe('Announcement');
  });

  it('returns the other member\'s cached display name for a direct chat', () => {
    expect(getRoomName(room(), 'me', usersCache)).toBe('Them Person');
  });

  it('falls back to "Direct Chat" when uncached or currentUid is missing', () => {
    expect(getRoomName(room(), 'me', {})).toBe('Direct Chat');
    expect(getRoomName(room(), null, usersCache)).toBe('Direct Chat');
    expect(getRoomName(room(), undefined, usersCache)).toBe('Direct Chat');
  });
});

describe('getRoomPhoto', () => {
  it('is always null for a group or an announcement', () => {
    expect(getRoomPhoto(room({ type: 'group', name: 'X' }), 'me', { them: { displayName: 'T', photoURL: 'p' } })).toBeNull();
    expect(getRoomPhoto(room({ type: 'announcement', name: 'X' }), 'me', { them: { displayName: 'T', photoURL: 'p' } })).toBeNull();
  });

  it('returns the other member\'s cached photo, or null when missing', () => {
    expect(getRoomPhoto(room(), 'me', { them: { displayName: 'Them', photoURL: 'p.jpg' } })).toBe('p.jpg');
    expect(getRoomPhoto(room(), 'me', { them: { displayName: 'Them' } })).toBeNull();
    expect(getRoomPhoto(room(), 'me', {})).toBeNull();
  });
});

describe('isRoomUnread', () => {
  it('is false with no lastMessage', () => {
    expect(isRoomUnread(room(), 'me', null)).toBe(false);
  });

  it('is false when the current user sent the last message', () => {
    const r = room({ lastMessage: { text: 'hi', senderId: 'me', senderName: 'Me', timestamp: new Date(NOW).toISOString() } });
    expect(isRoomUnread(r, 'me', 100)).toBe(false);
  });

  it('is true when never read (lastReadMs null)', () => {
    const r = room({ lastMessage: { text: 'hi', senderId: 'them', senderName: 'Them', timestamp: new Date(NOW).toISOString() } });
    expect(isRoomUnread(r, 'me', null)).toBe(true);
  });

  it('compares the last message time against the last-read marker', () => {
    const r = room({ lastMessage: { text: 'hi', senderId: 'them', senderName: 'Them', timestamp: new Date(NOW).toISOString() } });
    expect(isRoomUnread(r, 'me', NOW - 1)).toBe(true);
    expect(isRoomUnread(r, 'me', NOW)).toBe(false);
    expect(isRoomUnread(r, 'me', NOW + 1)).toBe(false);
  });
});

describe('sortRoomsByRecency', () => {
  it('sorts by lastMessage.timestamp, falling back to createdAt, newest first', () => {
    const older = room({ id: 'older', createdAt: new Date(NOW - 5000).toISOString() });
    const newerByMessage = room({
      id: 'newer-by-message',
      createdAt: new Date(NOW - 9000).toISOString(),
      lastMessage: { text: 'x', senderId: 'me', senderName: 'Me', timestamp: new Date(NOW).toISOString() },
    });
    const oldest = room({ id: 'oldest', createdAt: new Date(NOW - 10_000).toISOString() });
    const sorted = sortRoomsByRecency([oldest, older, newerByMessage]);
    expect(sorted.map((r) => r.id)).toEqual(['newer-by-message', 'older', 'oldest']);
  });
});

describe('filterRooms', () => {
  const usersCache: Record<string, ChatUserSummary> = { them: { displayName: 'Alice' } };

  it('excludes rooms whose resolved name starts with cisa- (case-insensitive)', () => {
    const testRoom = room({ id: 'test', memberIds: ['me', 'tester'] });
    const cache = { ...usersCache, tester: { displayName: 'CISA-Bot' } };
    expect(filterRooms([room(), testRoom], 'me', cache, '')).toEqual([room()]);
  });

  it('applies a case-insensitive substring search on the resolved name', () => {
    expect(filterRooms([room()], 'me', usersCache, 'ali')).toHaveLength(1);
    expect(filterRooms([room()], 'me', usersCache, 'zzz')).toHaveLength(0);
  });

  it('returns all non-test rooms when the search is empty', () => {
    expect(filterRooms([room()], 'me', usersCache, '')).toHaveLength(1);
  });

  it('hides a room the current user deleted for themselves', () => {
    expect(filterRooms([room({ deletedFor: ['me'] })], 'me', usersCache, '')).toEqual([]);
  });

  it('keeps the room for everyone else', () => {
    expect(filterRooms([room({ deletedFor: ['me'] })], 'them', usersCache, '')).toHaveLength(1);
  });
});

describe('filterChatUsers', () => {
  const users = [
    appUser({ uid: 'me', displayName: 'Me' }),
    appUser({ uid: 'unapproved', approved: false, displayName: 'Waiting' }),
    appUser({ uid: 'test1', email: 'cisa-test@example.com', displayName: 'Test' }),
    appUser({ uid: 'test2', email: 'e@example.com', displayName: 'cisa-bot' }),
    appUser({ uid: 'alice', displayName: 'Alice Smith', email: 'alice@example.com' }),
  ];

  it('excludes the current user, unapproved users, and cisa- test accounts', () => {
    expect(filterChatUsers(users, 'me', '').map((u) => u.uid)).toEqual(['alice']);
  });

  it('substring-searches displayName and email', () => {
    expect(filterChatUsers(users, 'me', 'alice').map((u) => u.uid)).toEqual(['alice']);
    expect(filterChatUsers(users, 'me', 'smith').map((u) => u.uid)).toEqual(['alice']);
    expect(filterChatUsers(users, 'me', 'zzz')).toEqual([]);
  });
});

describe('groupMessagesByDay', () => {
  it('buckets a null timestamp under "Sending..."', () => {
    const groups = groupMessagesByDay([message({ id: 'pending', timestamp: null })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Sending...');
    expect(groups[0].messages.map((m) => m.id)).toEqual(['pending']);
  });

  it('groups same-day messages together and preserves order within a day', () => {
    const a = message({ id: 'a', timestamp: new Date(NOW).toISOString() });
    const b = message({ id: 'b', timestamp: new Date(NOW + 60_000).toISOString() });
    const groups = groupMessagesByDay([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('produces separate ordered groups across multiple days', () => {
    const dayOne = message({ id: 'day1', timestamp: new Date(NOW).toISOString() });
    const dayTwo = message({ id: 'day2', timestamp: new Date(NOW + 86_400_000).toISOString() });
    const groups = groupMessagesByDay([dayOne, dayTwo]);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages[0].id).toBe('day1');
    expect(groups[1].messages[0].id).toBe('day2');
  });
});

describe('messagePreviewText', () => {
  it('trims and returns non-empty text as-is', () => {
    expect(messagePreviewText('  hello world  ')).toBe('hello world');
  });

  it('falls back to "Shared {type}" for an empty text with an attachment', () => {
    expect(messagePreviewText('', [{ type: 'contact', id: 'c1', name: 'Alice' }])).toBe('Shared contact');
  });

  it('falls back to "New message" for empty text and no attachments', () => {
    expect(messagePreviewText('')).toBe('New message');
    expect(messagePreviewText('', [])).toBe('New message');
  });
});

describe('system message builders', () => {
  it('matches the exact strings written by the group-create/invite/leave flows', () => {
    expect(groupCreatedSystemMessage('User One', 'My Team')).toBe('User One created group "My Team"');
    expect(membersAddedSystemMessage('Alice', ['Bob'])).toBe('Alice added Bob to the group');
    expect(membersAddedSystemMessage('Alice', ['Bob', 'Carol'])).toBe('Alice added Bob, Carol to the group');
    expect(memberLeftSystemMessage('Bob')).toBe('Bob left the group');
    expect(announcementCreatedSystemMessage('Mei', 'Weekly notes')).toBe(
      'Mei started announcements for "Weekly notes"',
    );
  });
});

describe('isAnnouncement', () => {
  it('is true only for the announcement type', () => {
    expect(isAnnouncement(room({ type: 'announcement' }))).toBe(true);
    expect(isAnnouncement(room({ type: 'group' }))).toBe(false);
    expect(isAnnouncement(room())).toBe(false);
  });

  it('is false for a room written before the type existed', () => {
    // Rooms created by earlier builds have no `type` field at all.
    expect(isAnnouncement(room({ type: undefined as unknown as ChatRoom['type'] }))).toBe(false);
  });
});

describe('canPostToRoom', () => {
  it('lets only a Full-timer post at the top level in an announcement room', () => {
    const ann = room({ type: 'announcement', memberIds: ['me', 'boss'] });
    expect(canPostToRoom(ann, 'boss', true)).toBe(true);
    expect(canPostToRoom(ann, 'me', false)).toBe(false);
  });

  it('lets any room member reply in a thread in an announcement room (#743)', () => {
    const ann = room({ type: 'announcement', memberIds: ['me', 'boss'] });
    // When parentId is provided (a thread reply), members can post
    expect(canPostToRoom(ann, 'me', false, 'm1')).toBe(true);
    // Non-member cannot reply
    expect(canPostToRoom(ann, 'stranger', false, 'm1')).toBe(false);
  });

  it('lets any member post in a direct or group room', () => {
    expect(canPostToRoom(room(), 'me', false)).toBe(true);
    expect(canPostToRoom(room({ type: 'group' }), 'me', false)).toBe(true);
  });

  it('keeps a non-member out of a room they can see but do not belong to', () => {
    expect(canPostToRoom(room({ memberIds: ['a', 'b'] }), 'me', false)).toBe(false);
    expect(canPostToRoom(room({ memberIds: ['a', 'b'] }), null, false)).toBe(false);
  });

  it('lets an admin post in any non-announcement room they can read', () => {
    // Mirrors the rules' admin read/write bypass on chatRooms.
    expect(canPostToRoom(room({ type: 'group', memberIds: ['a', 'b'] }), 'boss', true)).toBe(true);
  });
});

describe('canRemoveConvForEveryone', () => {
  it('returns false for null or undefined room', () => {
    expect(canRemoveConvForEveryone(null as any, 'u1', false)).toBe(false);
  });

  it('allows the creator of the room to delete it for everyone', () => {
    const r = room({ createdById: 'u1' });
    expect(canRemoveConvForEveryone(r, 'u1', false)).toBe(true);
    expect(canRemoveConvForEveryone(r, 'u2', false)).toBe(false);
  });

  it('allows an admin to delete any room for everyone', () => {
    const r = room({ createdById: 'u1' });
    expect(canRemoveConvForEveryone(r, 'u2', true)).toBe(true);
  });
});

describe('mobile v2 Messages copy', () => {
  it('prefixes a row preview with You, or the sender\'s first name', () => {
    const withLast = (senderId: string, senderName: string) =>
      room({ lastMessage: { text: 'see you there', senderId, senderName, timestamp: NOW } });
    expect(chatRowPreview(withLast('me', 'Me Myself'), 'me')).toBe('You: see you there');
    expect(chatRowPreview(withLast('them', 'Ana Beltrán'), 'me')).toBe('Ana: see you there');
  });

  it('says nothing for a room nobody has written in', () => {
    expect(chatRowPreview(room(), 'me')).toBe('');
  });

  it('falls back to Someone when the stored sender name is blank', () => {
    const r = room({ lastMessage: { text: 'hi', senderId: 'x', senderName: '', timestamp: NOW } });
    expect(chatRowPreview(r, 'me')).toBe('Someone: hi');
  });

  it('names the kind of room, and stays quiet for a direct chat', () => {
    expect(chatKindNote(room({ type: 'announcement' }))).toBe('Announcements');
    expect(chatKindNote(room({ type: 'group', memberIds: ['a', 'b', 'c', 'd'] }))).toBe('4 people');
    expect(chatKindNote(room({ type: 'group', memberIds: ['a'] }))).toBe('1 person');
    expect(chatKindNote(room())).toBe('');
  });

  it('reports what is new, else how many conversations there are', () => {
    expect(messagesScreenNote(7, 0)).toBe('7');
    expect(messagesScreenNote(7, 3)).toBe('3 new');
    expect(messagesScreenNote(1, 1)).toBe('1 new');
    expect(messagesScreenNote(0, 0)).toBe('0');
  });
});

describe('chatRoomSubtitle (S5)', () => {
  // The web's English copy for the keys the helper reads.
  const en: Record<string, string> = {
    'chat.sub_direct': 'Just the two of you',
    'chat.sub_group': 'Group · {n} people',
    'chat.sub_announcement': 'Announcement · {n} people',
    'chat.posters_you': 'you post here',
    'chat.posters_one': '{name} posts here',
    'chat.posters_two': '{a} and {b} post here',
    'chat.posters_many': '{a} and {n} others post here',
    'chat.you': 'you',
  };
  const t = (key: string) => en[key] ?? key;
  const member = (displayName: string, role?: string) => ({ displayName, role });

  it('says "Just the two of you" for a direct chat', () => {
    expect(chatRoomSubtitle(room(), { members: [], meIsFullTimer: false, t })).toBe('Just the two of you');
  });

  it('counts a group, singular or plural, without pluralising the noun', () => {
    expect(chatRoomSubtitle(room({ type: 'group', memberIds: ['a', 'b', 'c', 'd'] }), { members: [], meIsFullTimer: false, t })).toBe('Group · 4 people');
    expect(chatRoomSubtitle(room({ type: 'group', memberIds: ['a'] }), { members: [], meIsFullTimer: false, t })).toBe('Group · 1 people');
  });

  it('names who posts in an announcement: two posters read "A and B post here"', () => {
    const ann = room({ type: 'announcement', memberIds: ['me', 'maria', 'grace'] });
    const members = [member('Grace Liu', 'admin'), member('Maria Santos', 'admin')];
    expect(chatRoomSubtitle(ann, { members, meIsFullTimer: false, t })).toBe(
      'Announcement · 3 people · Grace and Maria post here',
    );
  });

  it('leads with "you" for a Full-timer viewing an announcement', () => {
    const ann = room({ type: 'announcement', memberIds: ['me', 'maria'] });
    expect(chatRoomSubtitle(ann, { members: [member('Maria Santos', 'admin')], meIsFullTimer: true, t })).toBe(
      'Announcement · 2 people · you and Maria post here',
    );
  });

  it('uses "you post here" when the viewer is the only poster', () => {
    const ann = room({ type: 'announcement', memberIds: ['me'] });
    expect(chatRoomSubtitle(ann, { members: [], meIsFullTimer: true, t })).toBe('Announcement · 1 people · you post here');
  });

  it('names one or many posters the way the web does', () => {
    const ann = room({ type: 'announcement', memberIds: ['a', 'b', 'c', 'd'] });
    expect(
      chatRoomSubtitle(ann, { members: [member('Maria Santos', 'admin')], meIsFullTimer: false, t }),
    ).toBe('Announcement · 4 people · Maria posts here');
    expect(
      chatRoomSubtitle(ann, {
        members: [member('Maria Santos', 'admin'), member('Grace Liu', 'admin'), member('Josh Park', 'admin')],
        meIsFullTimer: false,
        t,
      }),
    ).toBe('Announcement · 4 people · Grace and 2 others post here');
  });

  it('gives the head alone when nobody posts (no Full-timers among the members)', () => {
    const ann = room({ type: 'announcement', memberIds: ['me', 'them'] });
    expect(chatRoomSubtitle(ann, { members: [member('Them Person', 'manager')], meIsFullTimer: false, t })).toBe(
      'Announcement · 2 people',
    );
  });
});

describe('announcementAudienceNote (C3)', () => {
  const en: Record<string, string> = {
    'modals.composer_audience_note': 'Posting to everyone on Campus — {n} people',
    'modals.composer_audience_note_custom': 'Posting to {n} people in this channel',
  };
  const t = (key: string) => en[key] ?? key;

  it('names the real audience for the "everyone" preset', () => {
    const ann = room({ type: 'announcement', memberIds: ['a', 'b', 'c'], audiencePreset: 'everyone' });
    expect(announcementAudienceNote(ann, t)).toBe('Posting to everyone on Campus — 3 people');
  });

  it('says "in this channel" for the "custom" preset', () => {
    const ann = room({ type: 'announcement', memberIds: ['a', 'b'], audiencePreset: 'custom' });
    expect(announcementAudienceNote(ann, t)).toBe('Posting to 2 people in this channel');
  });

  it('is empty for every room that is not an announcement', () => {
    expect(announcementAudienceNote(room({ type: 'group' }), t)).toBe('');
    expect(announcementAudienceNote(room(), t)).toBe('');
  });
});

describe('Slack-shaped threads (#563)', () => {
  const root1 = message({ id: 'm1', text: 'Root message 1' });
  const root2 = message({ id: 'm2', text: 'Root message 2' });
  const reply1_1 = message({ id: 'r1_1', parentId: 'm1', senderId: 'user1', text: 'Reply 1' });
  const reply1_2 = message({ id: 'r1_2', parentId: 'm1', senderId: 'user2', text: 'Reply 2' });
  const reply1_3 = message({ id: 'r1_3', parentId: 'm1', senderId: 'user1', text: 'Reply 3' });
  const all = [root1, root2, reply1_1, reply1_2, reply1_3];

  it('convTopLevel returns only messages with no parentId', () => {
    expect(convTopLevel(all).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('convReplies returns replies for the specific parentId', () => {
    expect(convReplies(all, 'm1').map((r) => r.id)).toEqual(['r1_1', 'r1_2', 'r1_3']);
    expect(convReplies(all, 'm2')).toEqual([]);
  });

  it('convReplyCount returns count of replies', () => {
    expect(convReplyCount(all, 'm1')).toBe(3);
    expect(convReplyCount(all, 'm2')).toBe(0);
  });

  it('convRepliers returns unique user IDs who replied in order', () => {
    expect(convRepliers(all, 'm1')).toEqual(['user1', 'user2']);
    expect(convRepliers(all, 'm2')).toEqual([]);
  });

  it('convLastReply returns the latest reply for a message', () => {
    expect(convLastReply(all, 'm1')?.id).toBe('r1_3');
    expect(convLastReply(all, 'm2')).toBeUndefined();
  });
});



