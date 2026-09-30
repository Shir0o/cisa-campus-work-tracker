// Messages (private chat) — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`). Notification-sending stays mobile-specific
// (wired via onNotify), same pattern as ./threads.ts's addThreadMessage.
import * as core from '@cisa/core';
import type { ChatAttachment, ChatMessage, ChatRoom } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

export function subscribeChatRooms(
  uid: string,
  cb: (rooms: ChatRoom[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeChatRooms(db, uid, cb, onError);
}

export function subscribeChatRoom(
  roomId: string,
  cb: (room: ChatRoom | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeChatRoom(db, roomId, cb, onError);
}

export function subscribeRoomMessages(
  roomId: string,
  cb: (messages: ChatMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeRoomMessages(db, roomId, cb, onError);
}

export async function getOrCreateDirectChat(
  currentUser: { uid: string; displayName: string },
  targetUser: { uid: string; displayName: string },
): Promise<string> {
  try {
    return await core.getOrCreateDirectChat(db, currentUser, targetUser);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'chatRooms');
    throw e;
  }
}

export async function createGroupChat(
  groupName: string,
  memberUids: string[],
  currentUser: { uid: string; displayName: string },
): Promise<string> {
  try {
    return await core.createGroupChat(db, groupName, memberUids, currentUser);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'chatRooms');
    throw e;
  }
}

/** A room its audience reads but only Full-timers post to. The rules only let
 * an admin create one. */
export async function createAnnouncementRoom(
  name: string,
  memberUids: string[],
  currentUser: { uid: string; displayName: string },
): Promise<string> {
  try {
    return await core.createAnnouncementRoom(db, name, memberUids, currentUser);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'chatRooms');
    throw e;
  }
}

/** Sends a message and notifies every other member's bell. */
export async function sendMessage(
  roomId: string,
  text: string,
  sender: { uid: string; displayName: string; photoURL?: string },
  attachments: ChatAttachment[] | undefined,
  memberIds: string[],
  room?: { type?: ChatRoom['type']; name?: string },
  /** Set to reply in a Thread. */
  parentId?: string | null,
): Promise<void> {
  try {
    await core.sendMessage(db, roomId, text, sender, attachments, {
      memberIds,
      roomType: room?.type,
      roomName: room?.name,
      parentId,
      // The bell entry is pushed to the recipient's devices by the
      // notification function (#270).
      onNotify: (payload) => void sendNotification(payload),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `chatRooms/${roomId}/messages`);
  }
}

export async function inviteToGroup(
  roomId: string,
  newUserUids: string[],
  newUserNames: string[],
  inviter: { uid: string; displayName: string },
): Promise<void> {
  try {
    await core.inviteToGroup(db, roomId, newUserUids, newUserNames, inviter);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `chatRooms/${roomId}`);
  }
}

export async function leaveGroup(
  roomId: string,
  user: { uid: string; displayName: string },
): Promise<void> {
  try {
    await core.leaveGroup(db, roomId, user);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `chatRooms/${roomId}`);
  }
}

/** Hides a conversation from ONE user's list — "delete for me". Nobody else
 *  sees a change, and a new message in the room brings it back (core's
 *  sendMessage clears `deletedFor`). Any member can do this to their own room. */
export async function hideChatRoomForUser(roomId: string, uid: string): Promise<void> {
  try {
    await core.hideChatRoomForUser(db, roomId, uid);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `chatRooms/${roomId}`);
  }
}

export async function deleteChatRoom(roomId: string): Promise<void> {
  try {
    await core.deleteChatRoom(db, roomId);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `chatRooms/${roomId}`);
  }
}

/** Records a passive read receipt for an announcement post (#1277): the
 *  viewer joins `readBy` when the post scrolls into view. A lost receipt is not
 *  worth interrupting the reader, so the error is swallowed — as the web's
 *  `markAnnouncementRead` does. */
export async function markAnnouncementRead(
  roomId: string,
  messageId: string,
  uid: string,
): Promise<void> {
  try {
    await core.markAnnouncementRead(db, roomId, messageId, uid);
  } catch (e) {
    console.debug('Failed to record announcement read receipt:', e);
  }
}

/** "Got it" on an announcement post — toggles the viewer's own entry. */
export async function acknowledgeAnnouncement(
  roomId: string,
  messageId: string,
  uid: string,
  current: string[] = [],
): Promise<void> {
  try {
    await core.acknowledgeAnnouncement(db, roomId, messageId, uid, current);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `chatRooms/${roomId}/messages/${messageId}`);
  }
}

export async function togglePinMessage(roomId: string, messageId: string, pinned: boolean, by?: string): Promise<void> {
  try {
    await core.togglePinMessage(db, roomId, messageId, pinned, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `chatRooms/${roomId}/messages/${messageId}`);
  }
}

/** Takes a message back for everyone — a tombstone; the rules refuse a delete. */
export async function removeMessageForEveryone(roomId: string, messageId: string, by: string): Promise<void> {
  try {
    await core.removeMessageForEveryone(db, roomId, messageId, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `chatRooms/${roomId}/messages/${messageId}`);
  }
}
