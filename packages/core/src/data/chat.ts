// Messages (private chat) — Firestore reads/writes behind an injected `db`.
// Mirrors the web app's src/services/chat.ts; system-message text and
// last-message preview text are shared with the pure ./chat module so both
// stay byte-identical.
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import {
  announcementCreatedSystemMessage,
  getDirectChatId,
  groupCreatedSystemMessage,
  memberLeftSystemMessage,
  membersAddedSystemMessage,
  messagePreviewText,
  sortRoomsByRecency,
} from "../chat";
import type { ChatAttachment, ChatMessage, ChatRoom } from "../types";

function normalizeTimestamp(value: unknown): string | null {
  return (value as { toDate?: () => Date } | null | undefined)?.toDate?.()?.toISOString() ?? null;
}

function mapRoom(d: { id: string; data: () => Record<string, any> }): ChatRoom {
  const data = d.data();
  return {
    id: d.id,
    type: data.type,
    name: data.name,
    memberIds: data.memberIds ?? [],
    createdById: data.createdById,
    createdByName: data.createdByName,
    createdAt: normalizeTimestamp(data.createdAt),
    // #1279: the reader names an announcement's real audience from this.
    ...(data.audiencePreset ? { audiencePreset: data.audiencePreset } : {}),
    lastMessage: data.lastMessage
      ? {
          text: data.lastMessage.text,
          senderId: data.lastMessage.senderId,
          senderName: data.lastMessage.senderName,
          timestamp: normalizeTimestamp(data.lastMessage.timestamp),
        }
      : undefined,
  };
}

function mapMessage(d: { id: string; data: () => Record<string, any> }): ChatMessage {
  const data = d.data();
  return {
    id: d.id,
    roomId: data.roomId,
    text: data.text ?? "",
    senderId: data.senderId,
    senderName: data.senderName,
    senderPhoto: data.senderPhoto || undefined,
    timestamp: normalizeTimestamp(data.timestamp),
    type: data.type ?? "text",
    attachments: data.attachments ?? [],
    // What the web's rules let people write on a live message (#563, #743,
    // #1243): its thread, its pin, its take-back tombstone, its receipts.
    parentId: data.parentId ?? null,
    ...(data.pinned ? { pinned: true } : {}),
    ...(data.pinnedBy ? { pinnedBy: data.pinnedBy } : {}),
    ...(data.deleted ? { deleted: { by: data.deleted.by, at: normalizeTimestamp(data.deleted.at) } } : {}),
    ...(data.readBy ? { readBy: data.readBy } : {}),
    ...(data.acknowledged ? { acknowledged: data.acknowledged } : {}),
  };
}

/** Live subscription to a user's chat rooms — only rooms they're an explicit
 * member of, newest-first by last activity. Every role (including admin) is
 * scoped this way, matching the web app and the `chatRooms` rules, so a
 * Full-timer never sees another user's private conversations. */
export function subscribeChatRooms(
  db: Firestore,
  uid: string,
  cb: (rooms: ChatRoom[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const roomsQuery = query(collection(db, "chatRooms"), where("memberIds", "array-contains", uid));
  return onSnapshot(
    roomsQuery,
    (snap) => cb(sortRoomsByRecency(snap.docs.map(mapRoom))),
    (e) => (onError ? onError(e) : console.error("chat rooms subscription error", e)),
  );
}

/** Live subscription to a single room doc — cheaper than the full rooms
 * query for powering just a thread screen's header. */
export function subscribeChatRoom(
  db: Firestore,
  roomId: string,
  cb: (room: ChatRoom | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "chatRooms", roomId),
    (snap) => cb(snap.exists() ? mapRoom(snap) : null),
    (e) => (onError ? onError(e) : console.error("chat room subscription error", e)),
  );
}

export function subscribeRoomMessages(
  db: Firestore,
  roomId: string,
  cb: (messages: ChatMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "chatRooms", roomId, "messages"), orderBy("timestamp", "asc")),
    (snap) => cb(snap.docs.map(mapMessage)),
    (e) => (onError ? onError(e) : console.error("chat messages subscription error", e)),
  );
}

/** Returns an existing 1:1 room id, or creates the room first. */
export async function getOrCreateDirectChat(
  db: Firestore,
  currentUser: { uid: string; displayName: string },
  targetUser: { uid: string; displayName: string },
): Promise<string> {
  const roomId = getDirectChatId(currentUser.uid, targetUser.uid);
  const roomRef = doc(db, "chatRooms", roomId);
  const roomDoc = await getDoc(roomRef);
  if (!roomDoc.exists()) {
    await setDoc(roomRef, {
      type: "direct",
      memberIds: [currentUser.uid, targetUser.uid],
      createdById: currentUser.uid,
      createdByName: currentUser.displayName,
      createdAt: serverTimestamp(),
    });
  }
  return roomId;
}

async function createRoomWithGenesis(
  db: Firestore,
  type: "group" | "announcement",
  name: string,
  memberUids: string[],
  currentUser: { uid: string; displayName: string },
  genesisText: string,
): Promise<string> {
  const allMembers = Array.from(new Set([currentUser.uid, ...memberUids]));
  const roomRef = await addDoc(collection(db, "chatRooms"), {
    type,
    name,
    memberIds: allMembers,
    createdById: currentUser.uid,
    createdByName: currentUser.displayName,
    createdAt: serverTimestamp(),
  });
  await addDoc(collection(db, "chatRooms", roomRef.id, "messages"), {
    roomId: roomRef.id,
    text: genesisText,
    // The `messages` create rule requires `senderId == request.auth.uid` —
    // the literal `'system'` sentinel web's services/chat.ts uses fails that
    // check (a live, verified bug in the shipped app: it silently drops every
    // group's genesis message). Use the acting user's real uid here so the
    // write is rules-valid; `senderName`/`type` still drive the "System" pill
    // rendering (MessageBubble branches on `type`, never `senderId`).
    senderId: currentUser.uid,
    senderName: "System",
    timestamp: serverTimestamp(),
    type: "system",
  });
  return roomRef.id;
}

export async function createGroupChat(
  db: Firestore,
  groupName: string,
  memberUids: string[],
  currentUser: { uid: string; displayName: string },
): Promise<string> {
  return createRoomWithGenesis(
    db,
    "group",
    groupName,
    memberUids,
    currentUser,
    groupCreatedSystemMessage(currentUser.displayName, groupName),
  );
}

/** A room its audience reads but only Full-timers post to. The rules only let
 * an admin create one, so this is a staff-only call. */
export async function createAnnouncementRoom(
  db: Firestore,
  name: string,
  memberUids: string[],
  currentUser: { uid: string; displayName: string },
): Promise<string> {
  return createRoomWithGenesis(
    db,
    "announcement",
    name,
    memberUids,
    currentUser,
    announcementCreatedSystemMessage(currentUser.displayName, name),
  );
}

export interface ChatNotifyPayload {
  userId: string;
  title: string;
  message: string;
  type: "info";
  targetId: string;
  link?: string;
}

/** Sends a message and updates the room's last-message preview. `opts.onNotify`,
 * when given with `opts.memberIds`, is called once per recipient (everyone but
 * the sender) — each app supplies its own notification write, so this module
 * stays free of that side effect (mirrors ../data/threads.ts's addThreadMessage). */
export async function sendMessage(
  db: Firestore,
  roomId: string,
  text: string,
  sender: { uid: string; displayName: string; photoURL?: string },
  attachments?: ChatAttachment[],
  opts?: {
    memberIds?: string[];
    onNotify?: (payload: ChatNotifyPayload) => void;
    /** An announcement room's push is titled with its name, not "New message". */
    roomType?: "direct" | "group" | "announcement";
    roomName?: string;
    /** Set to reply in a Thread (one level deep, #563). */
    parentId?: string | null;
  },
): Promise<void> {
  const msgText = text.trim();
  if (!msgText && (!attachments || attachments.length === 0)) return;

  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    roomId,
    text: msgText,
    senderId: sender.uid,
    senderName: sender.displayName,
    senderPhoto: sender.photoURL || "",
    timestamp: serverTimestamp(),
    type: "text",
    attachments: attachments || [],
    parentId: opts?.parentId ?? null,
  });

  const basePreview = messagePreviewText(msgText, attachments);
  const previewText = opts?.parentId ? `in a thread: ${basePreview}` : basePreview;
  await updateDoc(doc(db, "chatRooms", roomId), {
    lastMessage: {
      text: previewText,
      senderId: sender.uid,
      senderName: sender.displayName,
      timestamp: serverTimestamp(),
    },
    // "Delete for me" is reversible: a new message brings the conversation
    // back for whoever hid it (including the sender — they're active in it).
    deletedFor: [],
  });

  if (opts?.onNotify && opts.memberIds) {
    const isAnnounce = opts.roomType === "announcement";
    // A reply in an announcement tells the post's author and the Thread's
    // other repliers, not all of the channel (mirrors the web's sendMessage).
    const recipients =
      isAnnounce && opts.parentId
        ? await threadParticipants(db, roomId, opts.parentId)
        : opts.memberIds;
    for (const memberId of recipients) {
      if (memberId === sender.uid) continue;
      opts.onNotify({
        userId: memberId,
        title: isAnnounce ? opts.roomName || "Announcement" : "New message",
        message: isAnnounce && !opts.parentId
          ? `${sender.displayName} posted an announcement: ${previewText}`
          : `${sender.displayName}: ${previewText}`,
        type: "info",
        targetId: roomId,
        link: opts.parentId ? `/messages/${roomId}?parent=${opts.parentId}` : `/messages/${roomId}`,
      });
    }
  }
}

async function threadParticipants(db: Firestore, roomId: string, parentId: string): Promise<string[]> {
  const who = new Set<string>();
  try {
    const replies = await getDocs(
      query(collection(db, "chatRooms", roomId, "messages"), where("parentId", "==", parentId)),
    );
    replies.docs.forEach((d) => {
      const senderId = d.data().senderId;
      if (senderId) who.add(senderId);
    });
    const parent = await getDoc(doc(db, "chatRooms", roomId, "messages", parentId));
    const author = parent.exists() ? parent.data()?.senderId : null;
    if (author) who.add(author);
  } catch (e) {
    console.error("Error fetching thread participants for notification:", e);
  }
  return [...who];
}

export async function inviteToGroup(
  db: Firestore,
  roomId: string,
  newUserUids: string[],
  newUserNames: string[],
  inviter: { uid: string; displayName: string },
): Promise<void> {
  await updateDoc(doc(db, "chatRooms", roomId), { memberIds: arrayUnion(...newUserUids) });
  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    roomId,
    text: membersAddedSystemMessage(inviter.displayName, newUserNames),
    // See createGroupChat's comment — senderId must be the real auth uid.
    senderId: inviter.uid,
    senderName: "System",
    timestamp: serverTimestamp(),
    type: "system",
  });
}

export async function leaveGroup(
  db: Firestore,
  roomId: string,
  user: { uid: string; displayName: string },
): Promise<void> {
  await updateDoc(doc(db, "chatRooms", roomId), { memberIds: arrayRemove(user.uid) });
  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    roomId,
    text: memberLeftSystemMessage(user.displayName),
    // See createGroupChat's comment — senderId must be the real auth uid.
    senderId: user.uid,
    senderName: "System",
    timestamp: serverTimestamp(),
    type: "system",
  });
}

/** "Delete for me": hides a conversation from ONE user's list. The room stays
 *  intact for everyone else, and any user can do this to their own room (the
 *  update rule lets members write it; the admin-only `delete` on rooms is not
 *  involved). A new message clears `deletedFor` in sendMessage. */
export async function hideChatRoomForUser(
  db: Firestore,
  roomId: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, "chatRooms", roomId), { deletedFor: arrayUnion(uid) });
}

/** Deletes a conversation room for everyone. Only room creator or an admin
 *  may call this. */
export async function deleteChatRoom(db: Firestore, roomId: string): Promise<void> {
  await deleteDoc(doc(db, "chatRooms", roomId));
}

/** Toggles the viewer's "Got it" on an announcement post. The rules let a
 *  member add or remove only their own entry. */
export async function acknowledgeAnnouncement(
  db: Firestore,
  roomId: string,
  messageId: string,
  uid: string,
  current: string[] = [],
): Promise<void> {
  const acknowledged = current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid];
  await updateDoc(doc(db, "chatRooms", roomId, "messages", messageId), { acknowledged });
}

/** Records a passive read receipt for an announcement post — the viewer joins
 *  `readBy` when the post comes into view (#1243, #1277). Mirrors the web's
 *  `markAnnouncementRead`; the rules let a member add only their own entry. */
export async function markAnnouncementRead(
  db: Firestore,
  roomId: string,
  messageId: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, "chatRooms", roomId, "messages", messageId), {
    readBy: arrayUnion(uid),
  });
}

/** Pins or unpins a message; anyone in the room can. `pinnedBy` names who, so
 *  an announcement's strip can say "Pinned by {name}". */
export async function togglePinMessage(
  db: Firestore,
  roomId: string,
  messageId: string,
  pinned: boolean,
  by?: string,
): Promise<void> {
  await updateDoc(doc(db, "chatRooms", roomId, "messages", messageId), {
    pinned,
    pinnedBy: pinned && by ? by : deleteField(),
  });
}

/** Takes a message back for everyone: a `deleted` tombstone, never a delete —
 *  the rules refuse `delete` on a message. Only its author or a Full-timer. */
export async function removeMessageForEveryone(
  db: Firestore,
  roomId: string,
  messageId: string,
  by: string,
): Promise<void> {
  await updateDoc(doc(db, "chatRooms", roomId, "messages", messageId), {
    deleted: { by, at: serverTimestamp() },
  });
}
