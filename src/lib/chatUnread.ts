// Unread counts on conversation rows (#1791).
//
// The read state is per device, not per user: a room is unread when its last
// message is newer than this browser's `chat_read_*` mark. A count therefore
// cannot live on the room document alone — it would have to be filtered by the
// local mark anyway — so each unread row costs one aggregate read over the
// messages after that mark. The helper is shared by the dot and the count so
// they can never disagree.
import {
  collection,
  getCountFromServer,
  query,
  Timestamp,
  where,
  type Firestore,
  type Query,
  type CollectionReference,
} from 'firebase/firestore';
import type { ChatRoom } from '../types';

/** Beyond this the row prints "9+" — one glyph, never a two-digit jitter. */
export const UNREAD_COUNT_CAP = 9;

/** The most unread rooms one list load will count. Past it the rows keep
 *  their dot; this bounds a large inbox's extra reads to one screenful. */
export const UNREAD_COUNT_ROOMS = 20;

/** The uid-specific read key, falling back to the device-wide one. */
export function roomReadKey(roomId: string, uid?: string): string {
  return uid ? `chat_read_${uid}_${roomId}` : `chat_read_${roomId}`;
}

/** The per-device read mark for a room, in ms; null when never opened. Kept
 *  in the same key order as the dot since #1764. */
export function roomReadMarkMs(
  roomId: string,
  uid?: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): number | null {
  const raw = storage.getItem(roomReadKey(roomId, uid)) || storage.getItem(`chat_read_${roomId}`);
  const ms = raw ? Number(raw) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Whether a room's row is unread — only someone else's last word counts. */
export function roomIsUnread(
  room: ChatRoom,
  uid?: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): boolean {
  if (!room.lastMessage || room.lastMessage.senderId === uid) return false;
  const mark = roomReadMarkMs(room.id, uid, storage);
  if (mark === null) return true;
  return (room.lastMessage.timestamp?.seconds * 1000 || 0) > mark;
}

/** The messages the mark has not reached. No mark means the whole room. */
export function unreadMessagesQuery(
  firestore: Firestore,
  roomId: string,
  readMarkMs: number | null,
): Query | CollectionReference {
  const messages = collection(firestore, 'chatRooms', roomId, 'messages');
  return readMarkMs === null
    ? messages
    : query(messages, where('timestamp', '>', Timestamp.fromMillis(readMarkMs)));
}

/** One aggregate read: how many messages sit after this device's mark. */
export async function countUnreadMessages(
  firestore: Firestore,
  roomId: string,
  readMarkMs: number | null,
): Promise<number> {
  const snapshot = await getCountFromServer(unreadMessagesQuery(firestore, roomId, readMarkMs));
  return snapshot.data().count;
}

/** The visible count; empty for a read room so no badge is drawn. */
export function unreadCountLabel(count: number): string {
  if (count <= 0) return '';
  return count > UNREAD_COUNT_CAP ? `${UNREAD_COUNT_CAP}+` : String(count);
}

/** What the row's name says after a comma. Without a count (unread but not
 *  yet resolved, or an aggregate that failed) it stays the plain word. */
export function unreadA11yText(count: number | undefined, t: (key: string) => string): string {
  if (count === undefined || count <= 0) return t('chat.unread');
  if (count > UNREAD_COUNT_CAP) {
    return t('chat.unread_count_more').replace('{n}', String(UNREAD_COUNT_CAP));
  }
  return t('chat.unread_count').replace('{n}', String(count));
}
