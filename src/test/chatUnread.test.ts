import { describe, expect, it } from 'vitest';
import {
  UNREAD_COUNT_CAP,
  roomIsUnread,
  roomReadMarkMs,
  unreadA11yText,
  unreadCountLabel,
} from '../lib/chatUnread';
import type { ChatRoom } from '../types';

const room = (over: Partial<ChatRoom> = {}): ChatRoom => ({
  id: 'room1',
  type: 'group',
  name: 'Trainees Chat',
  memberIds: ['u1', 'u2'],
  createdById: 'u2',
  createdByName: 'Alice',
  createdAt: { seconds: 100000 },
  lastMessage: {
    text: 'Hello',
    senderId: 'u2',
    senderName: 'Alice',
    timestamp: { seconds: 100005 },
  },
  ...over,
});

/** A stand-in for localStorage with only what the read-mark helpers use. */
function storage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

const t = (key: string) =>
  ({
    'chat.unread': 'unread',
    'chat.unread_count': '{n} unread',
    'chat.unread_count_more': 'More than {n} unread',
  })[key] ?? key;

describe('unread count label', () => {
  it('caps at 9+ so the number stays one glyph wide (#1791)', () => {
    expect(UNREAD_COUNT_CAP).toBe(9);
    expect(unreadCountLabel(1)).toBe('1');
    expect(unreadCountLabel(9)).toBe('9');
    expect(unreadCountLabel(10)).toBe('9+');
    expect(unreadCountLabel(250)).toBe('9+');
  });

  it('renders nothing for a read row', () => {
    expect(unreadCountLabel(0)).toBe('');
  });
});

describe('the per-device read mark', () => {
  it('reads the uid-specific key first, then the device-wide key', () => {
    expect(roomReadMarkMs('room1', 'u1', storage({ chat_read_u1_room1: '5000' }))).toBe(5000);
    // The uid key shadows the device key exactly as the dot's lookup does.
    expect(
      roomReadMarkMs('room1', 'u1', storage({ chat_read_u1_room1: '5000', chat_read_room1: '9000' })),
    ).toBe(5000);
    expect(roomReadMarkMs('room1', undefined, storage({ chat_read_room1: '9000' }))).toBe(9000);
  });

  it('is null when the room was never opened or the stored value is junk', () => {
    expect(roomReadMarkMs('room1', 'u1', storage())).toBeNull();
    expect(roomReadMarkMs('room1', 'u1', storage({ chat_read_room1: 'not-a-number' }))).toBeNull();
  });
});

describe('roomIsUnread', () => {
  it('is unread only when someone else spoke last', () => {
    expect(roomIsUnread(room(), 'u1', storage())).toBe(true);
    expect(roomIsUnread(room({ lastMessage: undefined }), 'u1', storage())).toBe(false);
    expect(
      roomIsUnread(
        room({
          lastMessage: { text: 'mine', senderId: 'u1', senderName: 'Me', timestamp: { seconds: 100005 } },
        }),
        'u1',
        storage(),
      ),
    ).toBe(false);
  });

  it('clears once the read mark reaches the last message', () => {
    expect(roomIsUnread(room(), 'u1', storage({ chat_read_room1: '100004000' }))).toBe(true);
    expect(roomIsUnread(room(), 'u1', storage({ chat_read_room1: '100005000' }))).toBe(false);
    expect(roomIsUnread(room(), 'u1', storage({ chat_read_room1: '100006000' }))).toBe(false);
  });
});

describe('the row announcement', () => {
  it('says how many unread, and falls back to plain "unread" without a count', () => {
    expect(unreadA11yText(undefined, t)).toBe('unread');
    expect(unreadA11yText(0, t)).toBe('unread');
    expect(unreadA11yText(1, t)).toBe('1 unread');
    expect(unreadA11yText(9, t)).toBe('9 unread');
    expect(unreadA11yText(10, t)).toBe('More than 9 unread');
  });
});
