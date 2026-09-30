// The chat-room adapter (ADR 0033 §6): a DM, a group or an announcement over
// the existing chat service (chatRooms/{id}/messages). No path, shape or rule
// changes. Posting rules are the rules' own (canPostToRoom in @cisa/core): in
// an announcement only a Full-timer posts top-level, and any member replies
// in a Thread.
import { sendMessage } from "../../services/chat";
import { firstName } from "../../lib/utils";
import type { StreamMessage } from "../../lib/stream";
import type { ChatAttachment, ChatMessage, ChatRoom } from "../../types";
import type { StreamAdapter } from "./types";

/** A chat message as the stream model reads it, with the message it came from. */
export interface ChatStreamMessage extends StreamMessage {
  source: ChatMessage;
}

interface ChatMember {
  uid: string;
  displayName: string;
  /** AppRole from the user doc: 'admin' is a Full-timer. */
  role?: string;
}

/** A Firestore Timestamp, `{ seconds }`, or an ISO string, as ISO. A pending
 *  server time (null until the write lands) reads as now. */
function atOf(ts: unknown): string {
  const v = ts as { toDate?: () => Date; seconds?: number } | string | null | undefined;
  if (v && typeof v === "object" && typeof v.toDate === "function") return v.toDate().toISOString();
  if (v && typeof v === "object" && typeof v.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return new Date().toISOString();
}

export function toStreamMessage(m: ChatMessage): ChatStreamMessage {
  return {
    id: m.id,
    parentId: m.parentId ?? null,
    from: m.senderId,
    fromName: m.senderName,
    body: m.text ?? "",
    at: atOf(m.timestamp),
    source: m,
  };
}

/** A chat room's per-device last-read (a ms string in localStorage) as ISO. */
export function chatReadMark(raw: string | null): string | null {
  const ms = raw ? Number(raw) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** An announcement's read state is per post (`readBy`): the New line sits just
 *  above the first top-level post by someone else the viewer hasn't read. */
export function announcementReadMark(messages: ChatMessage[], uid: string): string | null {
  const first = messages
    .filter((m) => !m.parentId && !m.deleted && m.senderId !== uid && !(m.readBy ?? []).includes(uid))
    .map((m) => new Date(atOf(m.timestamp)).getTime())
    .sort((a, b) => a - b)[0];
  return first === undefined ? null : new Date(first - 1).toISOString();
}

/** The line under a room's name (S5): "Group · 4 people", or
 *  "Announcement · 24 people · Maria and 2 others post here". */
export function chatRoomSubtitle(
  room: ChatRoom,
  { members, meIsFullTimer, t }: { members: ChatMember[]; meIsFullTimer: boolean; t: (key: string) => string },
): string {
  const n = String(room.memberIds?.length ?? 0);
  if (room.type === "direct") return t("chat.sub_direct");
  if (room.type === "group") return t("chat.sub_group").replace("{n}", n);
  const head = t("chat.sub_announcement").replace("{n}", n);
  const others = members
    .filter((m) => m.role === "admin")
    .map((m) => firstName(m.displayName))
    .sort((a, b) => a.localeCompare(b));
  const names = meIsFullTimer ? [t("chat.you"), ...others] : others;
  if (names.length === 0) return head;
  const posters =
    names.length === 1
      ? meIsFullTimer
        ? t("chat.posters_you")
        : t("chat.posters_one").replace("{name}", names[0])
      : names.length === 2
        ? t("chat.posters_two").replace("{a}", names[0]).replace("{b}", names[1])
        : t("chat.posters_many").replace("{a}", names[0]).replace("{n}", String(names.length - 1));
  return `${head} · ${posters}`;
}

export interface ChatAdapterInput {
  room: ChatRoom;
  roomName: string;
  /** The messages this viewer sees — hidden ones already left out. */
  messages: ChatMessage[];
  me: { uid: string; displayName: string; photoURL?: string; isFullTimer: boolean };
  /** The room's other members. */
  members: ChatMember[];
  lastReadAt: string | null;
  /** Attachments staged for the next post. */
  staged: ChatAttachment[];
  /** The in-room search, when one is narrowing the stream. */
  search?: string;
  t: (key: string) => string;
  onAttach(): void;
  onUnstage(index: number): void;
  /** A post went through: clear the stage. */
  onSent(): void;
  onPin(message: ChatMessage, pinned: boolean): void;
  onHide(message: ChatMessage): void;
  /** Take a message back for everyone (the page also freshens the rail preview). */
  onRemove(message: ChatMessage): unknown;
}

/** The chat adapter, plus what stands in the composer's place when this viewer
 *  may not post top-level (an announcement's footer, S4) — the page hands it
 *  to the stream's `footer`. */
export type ChatStreamAdapter = StreamAdapter<ChatStreamMessage> & { readOnlyNote?: string };

export function chatAdapter(i: ChatAdapterInput): ChatStreamAdapter {
  const { room, me, t } = i;
  const isAnnouncement = room.type === "announcement";
  const isMember = room.memberIds.includes(me.uid);
  const canPost = !isAnnouncement || me.isFullTimer;
  const canReply = !isAnnouncement || me.isFullTimer || isMember;
  const sender = { uid: me.uid, displayName: me.displayName, photoURL: me.photoURL || "" };
  const nameOf = (uid: string, fallback: string) =>
    uid === me.uid ? me.displayName : i.members.find((m) => m.uid === uid)?.displayName || fallback;

  const send = async (body: string, attachments: ChatAttachment[] | undefined, parentId: string | null) => {
    try {
      await sendMessage(room.id, body, sender, attachments, room.memberIds, parentId, room.type, room.name);
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  };

  const audience = !isAnnouncement
    ? ""
    : (room.audiencePreset === "everyone"
        ? t("modals.composer_audience_note")
        : t("modals.composer_audience_note_custom")
      ).replace("{n}", String(room.memberIds.length));

  return {
    messages: i.messages.map(toStreamMessage),
    name: i.roomName,
    where: i.roomName,
    audience: canPost ? audience : "",
    empty: i.search ? t("chat.no_match").replace("{q}", i.search) : t("common.empty_messages"),
    composer: {
      placeholder: isAnnouncement ? t("chat.placeholder_announcement") : t("chat.placeholder"),
      // Chat.dc.html: a chat sends; an announcement posts (Announce-FT.dc.html).
      ...(isAnnouncement ? {} : { hint: t("chat.send_hint") }),
    },
    // A post is a confirmed write: a failed send keeps the draft and the stage.
    failure: { post: t("chat.send_failed"), edit: t("chat.send_failed") },
    readOnlyNote: canPost ? undefined : t("modals.guidance_announcement_bar"),
    capabilities: { kinds: false, attachments: true, canPost, canReply },
    // The members of the chat (ADR 0007), as the room already offered.
    mentionCandidates: i.members.map((m) => ({ uid: m.uid, name: m.displayName, role: m.role })),
    lastReadAt: i.lastReadAt,

    pinnedLabel: (m) => {
      const s = m.source;
      if (!isAnnouncement || m.parentId || !s.pinned || s.deleted) return null;
      if (s.pinnedBy === me.uid) return t("chat.pinned_by_you_strip");
      // A post pinned from the create wizard, or before `pinnedBy`, credits its author.
      const name = s.pinnedBy ? nameOf(s.pinnedBy, s.senderName) : s.senderName;
      return t("modals.pinned_by_strip").replace("{name}", name);
    },
    avatarUrl: (m) => m.source.senderPhoto || null,
    badge: (m) => (isAnnouncement && !m.parentId ? t("modals.full_timer_badge") : null),
    goneLabel: (m) => {
      const gone = m.source.deleted;
      if (!gone) return null;
      if (gone.by === me.uid) return m.from === me.uid ? t("chat.gone_you_took_back") : t("chat.gone_you_removed");
      if (gone.by === m.from) return t("chat.gone_took_back").replace("{name}", firstName(m.fromName));
      return t("chat.gone_removed_by").replace("{name}", firstName(nameOf(gone.by, gone.by)));
    },
    notice: (m) => m.source.type === "system",
    deleteLabel: (m) => (m.from === me.uid ? t("chat.take_back") : t("chat.remove_for_everyone")),
    deleteConfirm: { prompt: t("chat.take_back_prompt"), yes: t("chat.take_back_yes"), no: t("chat.take_back_no") },
    moreActions: (m) => [
      m.source.pinned
        ? { label: t("chat.unpin"), run: () => i.onPin(m.source, false) }
        : { label: t("chat.pin"), run: () => i.onPin(m.source, true) },
      { label: t("chat.hide"), run: () => i.onHide(m.source) },
    ],

    staged: i.staged.map((a, n) => ({ key: String(n), label: a.name, kind: a.type === "contact" ? "contact" : "file" })),
    attach: i.onAttach,
    unstage: (key) => i.onUnstage(Number(key)),

    // Rejects on failure (see `failure`), so the stream keeps the draft.
    post: async ({ body }) => {
      if (!(await send(body, i.staged, null))) throw new Error("send failed");
      i.onSent();
    },
    reply: async (parent, { body }) => {
      await send(body, undefined, parent.id);
    },
    // Chat has no Follow-up asks.
    closeAsk: () => undefined,
    delete: (m) => i.onRemove(m.source),
  };
}
