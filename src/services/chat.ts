import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';
import { db, sendNotification } from '../lib/firebase';
import { ChatAttachment, ChatReaction } from '../types';

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

  if (roomDoc.exists()) {
    return roomId;
  }

  // Check if a direct room with these memberIds already exists under another ID
  try {
    const q = query(
      collection(db, 'chatRooms'),
      where('type', '==', 'direct'),
      where('memberIds', 'array-contains', currentUser.uid)
    );
    const snap = await getDocs(q);
    const existing = snap.docs.find((d) => {
      const data = d.data();
      return Array.isArray(data.memberIds) && data.memberIds.includes(targetUser.uid);
    });
    if (existing) {
      return existing.id;
    }
  } catch (err) {
    console.error('Error checking existing direct chat:', err);
  }

  await setDoc(roomRef, {
    type: 'direct',
    memberIds: [currentUser.uid, targetUser.uid],
    createdById: currentUser.uid,
    createdByName: currentUser.displayName,
    createdAt: serverTimestamp(),
  });

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
    senderId: currentUser.uid,
    senderName: 'System',
    timestamp: serverTimestamp(),
    type: 'system',
  });

  // Notify members added to group
  for (const memberId of memberUids) {
    if (memberId === currentUser.uid) continue;
    void sendNotification({
      userId: memberId,
      title: 'Added to group',
      message: `${currentUser.displayName} added you to group "${groupName}"`,
      type: 'info',
      targetId: roomRef.id,
      link: `/messages/${roomRef.id}`,
    });
  }

  return roomRef.id;
}

/**
 * Creates an announcement room — everyone in it reads, only Full-timers post.
 * firestore.rules only lets an admin create one, so this is a staff-only call.
 */
export async function createAnnouncementRoom(
  name: string,
  memberUids: string[],
  currentUser: { uid: string; displayName: string }
): Promise<string> {
  const allMembers = Array.from(new Set([currentUser.uid, ...memberUids]));

  const roomRef = await addDoc(collection(db, 'chatRooms'), {
    type: 'announcement',
    name,
    memberIds: allMembers,
    createdById: currentUser.uid,
    createdByName: currentUser.displayName,
    createdAt: serverTimestamp(),
  });

  // Post system genesis message. senderId must be the acting uid, not the
  // 'system' sentinel createGroupChat uses — the messages create rule checks
  // `senderId == request.auth.uid` and silently drops the write otherwise.
  await addDoc(collection(db, 'chatRooms', roomRef.id, 'messages'), {
    roomId: roomRef.id,
    text: `${currentUser.displayName} started announcements for "${name}"`,
    senderId: currentUser.uid,
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
  attachments?: ChatAttachment[],
  memberIds?: string[]
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

  // Notify recipient(s) in room
  let recipients = memberIds;
  if (!recipients || recipients.length === 0) {
    try {
      const roomDoc = await getDoc(doc(db, 'chatRooms', roomId));
      if (roomDoc.exists()) {
        const data = roomDoc.data();
        recipients = Array.isArray(data?.memberIds) ? data.memberIds : [];
      }
    } catch (e) {
      console.error('Error fetching room members for notification:', e);
    }
  }

  if (recipients && Array.isArray(recipients)) {
    for (const memberId of recipients) {
      if (memberId === sender.uid) continue;
      void sendNotification({
        userId: memberId,
        title: 'New message',
        message: `${sender.displayName}: ${previewText}`,
        type: 'info',
        targetId: roomId,
        link: `/messages/${roomId}`,
      });
    }
  }
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

  // Notify invited members
  for (const memberId of newUserUids) {
    void sendNotification({
      userId: memberId,
      title: 'Added to group',
      message: `${inviterName} added you to the group`,
      type: 'info',
      targetId: roomId,
      link: `/messages/${roomId}`,
    });
  }
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

/**
 * Toggle a reaction on a message. `by` is the reacting user's uid; the emoji
 * flips on or off for that user only. firestore.rules only lets a room member
 * write the `reactions` field, so this is a single targeted update.
 */
export async function reactToMessage(
  roomId: string,
  messageId: string,
  by: string,
  emoji: string,
  current: ChatReaction[]
): Promise<void> {
  const has = current.some((r) => r.by === by && r.emoji === emoji);
  const reactions = has
    ? current.filter((r) => !(r.by === by && r.emoji === emoji))
    : [...current, { by, emoji }];
  await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), { reactions });
}

/**
 * Pin or unpin a message. Anyone in the room can do it — the pinned strip is a
 * conversation-level convenience, not a permission boundary.
 */
export async function togglePinMessage(roomId: string, messageId: string, pinned: boolean): Promise<void> {
  await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), { pinned });
}

/**
 * Take a message back for everyone: leaves a `deleted` tombstone so the thread
 * shows "Message removed" instead of the text. Only the author or a Full-timer
 * may call this — firestore.rules enforces it server-side too, and it splits
 * this tombstone write from reaction/pin toggles: only `deleted` may change.
 */
export async function removeMessageForEveryone(roomId: string, messageId: string, by: string): Promise<void> {
  await updateDoc(doc(db, 'chatRooms', roomId, 'messages', messageId), {
    deleted: { by, at: serverTimestamp() },
  });
}

/**
 * Permanently delete a conversation room for everyone. Only the room's creator
 * or an Admin / Full-timer may call this — firestore.rules enforces it server-side.
 */
export async function deleteChatRoom(roomId: string): Promise<void> {
  await deleteDoc(doc(db, 'chatRooms', roomId));
}

/**
 * Check whether the viewer can delete a room for everyone — its creator or an Admin.
 */
export function canRemoveConvForEveryone(
  room: { createdById?: string } | null | undefined,
  currentUid: string | null | undefined,
  isAdmin: boolean
): boolean {
  if (!room) return false;
  return isAdmin || (!!currentUid && room.createdById === currentUid);
}


