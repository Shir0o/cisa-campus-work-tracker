// Messages (private chat) — pure room/message shaping shared by web
// (src/views/Messages.tsx) and mobile. Ported from Messages.tsx's inline
// getRoomName/getRoomPhoto/isUnread/groupMessagesByDay/filteredRooms helpers
// and src/components/modals/CreateChatModal.tsx's user filter. The Firestore
// reads/writes live in ./data/chat.ts; this module never touches Firestore.
import { firstName } from "./history";
import { parseMs } from "./myday";
import type { AppUser, ChatAttachment, ChatMessage, ChatRoom } from "./types";

export interface ChatUserSummary {
  displayName: string;
  photoURL?: string;
}

/** Deterministic room id for a 1:1 chat, order-independent. */
export function getDirectChatId(uid1: string, uid2: string): string {
  const sorted = [uid1, uid2].sort();
  return `direct_${sorted[0]}_${sorted[1]}`;
}

/** A room the whole audience reads but only Full-timers post to — the design's
 * "broadcast" conversation (MOBILE-V2.md, the member app's "Announcements").
 * Rooms written before the type existed have no `type` field at all, so this
 * is a positive test rather than a `!== 'direct' && !== 'group'`. */
export function isAnnouncement(room: ChatRoom): boolean {
  return room.type === "announcement";
}

/** Client-side mirror of the firestore.rules gate on
 * chatRooms/{id}/messages create: in an announcement room only a Full-timer
 * may post at the top level, but any room member may reply in a thread (#743).
 * Everywhere else, membership is the rule (admins read every room,
 * so `isAdmin` covers posting into one they aren't a member of). */
export function canPostToRoom(
  room: ChatRoom,
  currentUid: string | null | undefined,
  isAdmin: boolean,
  parentId?: string | null,
): boolean {
  if (isAnnouncement(room)) {
    if (parentId) {
      return isAdmin || (!!currentUid && room.memberIds.includes(currentUid));
    }
    return isAdmin;
  }
  return isAdmin || (!!currentUid && room.memberIds.includes(currentUid));
}

/** Whether the viewer can delete this room for everyone — its creator or a
 *  Full-timer / Admin. */
export function canRemoveConvForEveryone(
  room: ChatRoom,
  currentUid: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (!room) return false;
  return isAdmin || (!!currentUid && room.createdById === currentUid);
}

export function getRoomName(
  room: ChatRoom,
  currentUid: string | null | undefined,
  usersCache: Record<string, ChatUserSummary>,
): string {
  if (room.type === "announcement") return room.name || "Announcement";
  if (room.type === "group") return room.name || "Group";
  const otherUid = room.memberIds.find((id) => id !== currentUid);
  return (otherUid && usersCache[otherUid]?.displayName) || "Direct Chat";
}

export function getRoomPhoto(
  room: ChatRoom,
  currentUid: string | null | undefined,
  usersCache: Record<string, ChatUserSummary>,
): string | null {
  if (room.type !== "direct") return null;
  const otherUid = room.memberIds.find((id) => id !== currentUid);
  return (otherUid && usersCache[otherUid]?.photoURL) || null;
}

/** `lastReadMs` is this device's last-opened timestamp for the room (or null
 * if it's never been opened) — see apps/mobile's AsyncStorage-backed chatReads. */
export function isRoomUnread(
  room: ChatRoom,
  currentUid: string | null | undefined,
  lastReadMs: number | null,
): boolean {
  if (!room.lastMessage || room.lastMessage.senderId === currentUid) return false;
  if (lastReadMs == null) return true;
  const lastMsgMs = parseMs(room.lastMessage.timestamp as string | null | undefined) ?? 0;
  return lastMsgMs > lastReadMs;
}

/** Newest-first, by last message time (falling back to room creation time). */
export function sortRoomsByRecency(rooms: ChatRoom[]): ChatRoom[] {
  const roomMs = (r: ChatRoom) =>
    parseMs((r.lastMessage?.timestamp ?? r.createdAt) as string | null | undefined) ?? 0;
  return [...rooms].sort((a, b) => roomMs(b) - roomMs(a));
}

/** Excludes `cisa-` test-account rooms, rooms the user deleted-for-themselves
 *  (`.deletedFor`, see hideChatRoomForUser in ./data/chat), and applies the
 *  room-list search box. */
export function filterRooms(
  rooms: ChatRoom[],
  currentUid: string | null | undefined,
  usersCache: Record<string, ChatUserSummary>,
  search: string,
): ChatRoom[] {
  const needle = search.trim().toLowerCase();
  return rooms.filter((r) => {
    const name = getRoomName(r, currentUid, usersCache).toLowerCase();
    if (name.startsWith("cisa-")) return false;
    if (currentUid && (r.deletedFor || []).includes(currentUid)) return false;
    return !needle || name.includes(needle);
  });
}

/** Port of CreateChatModal's candidate list: no self, approved only, no test
 * accounts, filtered by the search box. */
export function filterChatUsers(
  users: AppUser[],
  currentUid: string | null | undefined,
  search: string,
): AppUser[] {
  const needle = search.trim().toLowerCase();
  return users.filter((u) => {
    if (u.uid === currentUid || !u.approved) return false;
    const email = (u.email || "").toLowerCase();
    const displayName = (u.displayName || "").toLowerCase();
    if (email.startsWith("cisa-") || displayName.startsWith("cisa-")) return false;
    return !needle || displayName.includes(needle) || email.includes(needle);
  });
}

export interface MessageDayGroup {
  key: string;
  label: string;
  messages: ChatMessage[];
}

/** Groups already-chronological messages into day buckets, preserving order.
 * A message with no server timestamp yet (optimistic/in-flight) buckets under
 * "Sending...". */
export function groupMessagesByDay(messages: ChatMessage[]): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const msg of messages) {
    const ms = parseMs(msg.timestamp as string | null | undefined);
    const label =
      ms == null
        ? "Sending..."
        : new Date(ms).toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
    const key = ms == null ? "sending" : label;
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = groups.length;
      indexByKey.set(key, idx);
      groups.push({ key, label, messages: [] });
    }
    groups[idx].messages.push(msg);
  }
  return groups;
}

/** The `lastMessage.text` preview stored on the room doc. */
export function messagePreviewText(text: string, attachments?: ChatAttachment[]): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (attachments && attachments.length > 0) return `Shared ${attachments[0].type}`;
  return "New message";
}

export function groupCreatedSystemMessage(creatorName: string, groupName: string): string {
  return `${creatorName} created group "${groupName}"`;
}

export function announcementCreatedSystemMessage(creatorName: string, name: string): string {
  return `${creatorName} started announcements for "${name}"`;
}

export function membersAddedSystemMessage(inviterName: string, addedNames: string[]): string {
  return `${inviterName} added ${addedNames.join(", ")} to the group`;
}

export function memberLeftSystemMessage(name: string): string {
  return `${name} left the group`;
}

// ── Mobile v2 copy (the design's `M2Messages`) ──────────────────────────────
// The conversation list is three lines per row and nothing else, so each line
// has to carry its weight. Tested here so the row and the thread head agree.

/** A room row's second line: "You: see you there" / "Ana: see you there".
 *  Only the sender's first name — a full name eats the preview. */
export function chatRowPreview(room: ChatRoom, currentUid: string | null | undefined): string {
  const last = room.lastMessage;
  if (!last) return "";
  const who = last.senderId === currentUid ? "You" : firstName(last.senderName);
  return `${who}: ${last.text}`;
}

/** What kind of room this is, for the row's third line and the thread's note.
 *  A direct chat says nothing — the other person's name already said it. */
export function chatKindNote(room: ChatRoom): string {
  if (room.type === "announcement") return "Announcements";
  if (room.type === "group") {
    const n = room.memberIds.length;
    return `${n} ${n === 1 ? "person" : "people"}`;
  }
  return "";
}

/** The count beside the Messages title — what's new if anything is, else how
 *  many conversations there are. */
export function messagesScreenNote(total: number, unread: number): string {
  return unread > 0 ? `${unread} new` : String(total);
}

// ── Slack-shaped threads (#563) ─────────────────────────────────────────────

/** Top-level messages in a conversation (replies filtered out). */
export function convTopLevel(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => !m.parentId);
}

/** Replies belonging to a parent message, chronological. */
export function convReplies(messages: ChatMessage[], parentId: string): ChatMessage[] {
  return messages.filter((m) => m.parentId === parentId);
}

/** Total reply count for a message. */
export function convReplyCount(messages: ChatMessage[], parentId: string): number {
  return convReplies(messages, parentId).length;
}

/** Unique uids of users who replied to a message, in order of first reply. */
export function convRepliers(messages: ChatMessage[], parentId: string): string[] {
  const seen = new Set<string>();
  const repliers: string[] = [];
  for (const r of convReplies(messages, parentId)) {
    if (r.senderId && !seen.has(r.senderId)) {
      seen.add(r.senderId);
      repliers.push(r.senderId);
    }
  }
  return repliers;
}

/** The latest reply to a message, if any. */
export function convLastReply(messages: ChatMessage[], parentId: string): ChatMessage | undefined {
  const replies = convReplies(messages, parentId);
  return replies[replies.length - 1];
}

