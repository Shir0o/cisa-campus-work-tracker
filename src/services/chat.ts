import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ChatAttachment } from '../types';

/**
 * Returns a sorted direct chat ID to ensure uniqueness per user pair.
 */
export function getDirectChatId(uid1: string, uid2: string): string {
  const sorted = [uid1, uid2].sort();
  return `direct_${sorted[0]}_${sorted[1]}`;
}

/**
 * Retrieves an existing 1-on-1 chat or creates it if it doesn't exist.
 */
export async function getOrCreateDirectChat(
  currentUser: { uid: string; displayName: string },
  targetUser: { uid: string; displayName: string }
): Promise<string> {
  const roomId = getDirectChatId(currentUser.uid, targetUser.uid);
  const roomRef = doc(db, 'chatRooms', roomId);
  const roomDoc = await getDoc(roomRef);

  if (!roomDoc.exists()) {
    await setDoc(roomRef, {
      type: 'direct',
      memberIds: [currentUser.uid, targetUser.uid],
      createdById: currentUser.uid,
      createdByName: currentUser.displayName,
      createdAt: serverTimestamp(),
    });
  }

  return roomId;
}

/**
 * Creates a new group chat room and logs a system message.
 */
export async function createGroupChat(
  groupName: string,
  memberUids: string[],
  currentUser: { uid: string; displayName: string }
): Promise<string> {
  const allMembers = Array.from(new Set([currentUser.uid, ...memberUids]));
  
  const roomRef = await addDoc(collection(db, 'chatRooms'), {
    type: 'group',
    name: groupName,
    memberIds: allMembers,
    createdById: currentUser.uid,
    createdByName: currentUser.displayName,
    createdAt: serverTimestamp(),
  });

  // Post system genesis message
  await addDoc(collection(db, 'chatRooms', roomRef.id, 'messages'), {
    roomId: roomRef.id,
    text: `${currentUser.displayName} created group "${groupName}"`,
    senderId: 'system',
    senderName: 'System',
    timestamp: serverTimestamp(),
    type: 'system',
  });

  return roomRef.id;
}

/**
 * Sends a message and updates the room's last message preview.
 */
export async function sendMessage(
  roomId: string,
  text: string,
  sender: { uid: string; displayName: string; photoURL?: string },
  attachments?: ChatAttachment[]
): Promise<void> {
  const messagesRef = collection(db, 'chatRooms', roomId, 'messages');
  
  const msgText = text.trim();
  if (!msgText && (!attachments || attachments.length === 0)) {
    return;
  }

  // Create message doc
  await addDoc(messagesRef, {
    roomId,
    text: msgText,
    senderId: sender.uid,
    senderName: sender.displayName,
    senderPhoto: sender.photoURL || '',
    timestamp: serverTimestamp(),
    type: 'text',
    attachments: attachments || [],
  });

  // Update last message preview in chatRoom
  const previewText = msgText || (attachments && attachments.length > 0 
    ? `Shared ${attachments[0].type}` 
    : 'New message');

  await updateDoc(doc(db, 'chatRooms', roomId), {
    lastMessage: {
      text: previewText,
      senderId: sender.uid,
      senderName: sender.displayName,
      timestamp: serverTimestamp(),
    },
  });
}

/**
 * Invites members to an existing group chat room and logs a system message.
 */
export async function inviteToGroup(
  roomId: string,
  newUserUids: string[],
  newUserNames: string[],
  inviterName: string
): Promise<void> {
  const roomRef = doc(db, 'chatRooms', roomId);
  await updateDoc(roomRef, {
    memberIds: arrayUnion(...newUserUids),
  });

  // Post system message
  const namesStr = newUserNames.join(', ');
  await addDoc(collection(db, 'chatRooms', roomId, 'messages'), {
    roomId,
    text: `${inviterName} added ${namesStr} to the group`,
    senderId: 'system',
    senderName: 'System',
    timestamp: serverTimestamp(),
    type: 'system',
  });
}

/**
 * Leaves a group chat room and logs a system message.
 */
export async function leaveGroup(
  roomId: string,
  user: { uid: string; displayName: string }
): Promise<void> {
  const roomRef = doc(db, 'chatRooms', roomId);
  await updateDoc(roomRef, {
    memberIds: arrayRemove(user.uid),
  });

  // Post system message
  await addDoc(collection(db, 'chatRooms', roomId, 'messages'), {
    roomId,
    text: `${user.displayName} left the group`,
    senderId: 'system',
    senderName: 'System',
    timestamp: serverTimestamp(),
    type: 'system',
  });
}
