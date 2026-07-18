// Messages (private chat) — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`). Notification-sending stays mobile-specific
// (wired via onNotify), same pattern as ./threads.ts's addThreadMessage.
import * as core from '@cisa/core';
import type { ChatAttachment, ChatMessage, ChatRoom } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

export function subscribeChatRooms(
  uid: string,
  isAdmin: boolean,
  cb: (rooms: ChatRoom[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeChatRooms(db, uid, isAdmin, cb, onError);
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

/** Sends a message and notifies every other member's bell. */
export async function sendMessage(
  roomId: string,
  text: string,
  sender: { uid: string; displayName: string; photoURL?: string },
  attachments: ChatAttachment[] | undefined,
  memberIds: string[],
): Promise<void> {
  try {
    await core.sendMessage(db, roomId, text, sender, attachments, {
      memberIds,
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
