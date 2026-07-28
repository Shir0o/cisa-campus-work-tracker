// Messages (private chat) — Firestore reads/writes behind an injected `db`.
// Mirrors the web app's src/services/chat.ts; system-message text and
// last-message preview text are shared with the pure ./chat module so both
// stay byte-identical.
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
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
  };
}

/** Live subscription to a user's chat rooms — every room for an admin
 * (matches the `chatRooms` rules' admin read bypass), else only rooms they're
 * a member of. Newest-first by last activity. */
export function subscribeChatRooms(
  db: Firestore,
  uid: string,
  isAdmin: boolean,
  cb: (rooms: ChatRoom[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const roomsQuery = isAdmin
    ? query(collection(db, "chatRooms"), orderBy("createdAt", "desc"))
    : query(collection(db, "chatRooms"), where("memberIds", "array-contains", uid));
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
  opts?: { memberIds?: string[]; onNotify?: (payload: ChatNotifyPayload) => void },
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
  });

  const previewText = messagePreviewText(msgText, attachments);
  await updateDoc(doc(db, "chatRooms", roomId), {
    lastMessage: {
      text: previewText,
      senderId: sender.uid,
      senderName: sender.displayName,
      timestamp: serverTimestamp(),
    },
  });

  if (opts?.onNotify && opts.memberIds) {
    for (const memberId of opts.memberIds) {
      if (memberId === sender.uid) continue;
      opts.onNotify({
        userId: memberId,
        title: "New message",
        message: `${sender.displayName}: ${previewText}`,
        type: "info",
        targetId: roomId,
        link: `/messages/${roomId}`,
      });
    }
  }
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
