// The source adapter (ADR 0033 §6): everything a written stream needs from
// where its messages live. The stream component draws rows, the toolbar, the
// Thread and the composer; an adapter supplies the messages, the writes, what
// this viewer may do, and the words that say who is reading. One adapter per
// source — a contact's Conversation first; Full-timers, chat rooms and
// Feedback Follow-ups later — and no source renders messages itself.
import type { StreamMessage } from "../../lib/stream";
import type { MentionUser } from "../../lib/mentions";

/** What an adapter hands the component: the model's fields, plus whatever the
 *  source carries (the component gives the message back as it came). */
export type StreamSourceMessage = StreamMessage & {
  /** When the author last rewrote it; a row shows "Edited" when set. */
  editedAt?: string | null;
  /** The avatar's letters where the name's own initials would mislead — a
   *  voice rather than a person ("The team" is "T", not "TT"). */
  initials?: string;
};

/** A roster entry as a surface holds it, for @mentions. */
export interface TeamMemberLike {
  id: string;
  name: string;
  role?: string;
  initials?: string;
}

export interface StreamCapabilities {
  /** This viewer may post top-level messages. */
  canPost: boolean;
  /** This viewer may reply in a Thread. */
  canReply: boolean;
}

export interface StreamAdapter<M extends StreamSourceMessage = StreamSourceMessage> {
  /** Every message in the stream, replies included, in any order. */
  messages: M[];
  /** The stream's own name — "Conversation" — for a Thread's back control. */
  name: string;
  /** Where the stream lives, for a Thread's header: "Conversation · Daniel Reyes". */
  where: string;
  /** The line above the composer saying whose eyes a message reaches. */
  audience: string;
  /** Shown above the audience line when the stream is restricted. */
  locked?: boolean;
  /** What an empty stream says. */
  empty?: string;
  /** Placeholder in a Thread's reply box, where the default is "Reply…". */
  replyPlaceholder?: string;
  capabilities: StreamCapabilities;
  /** Who may be @mentioned here (ADR 0007), already cut to this stream. */
  mentionCandidates: MentionUser[];
  /** The viewer's last-read point, where the source has read state. */
  lastReadAt?: string | null;
  /** A neutral tag beside the author's name ("Full-timer"). */
  badge?(message: M): string | null;
  /** The author's photo, where the source has one. The row falls back to
   *  initials without it, or when it fails to load. */
  avatarUrl?(message: M): string | null;
  /** A line from the system ("Josh joined"), drawn centred rather than as a row. */
  notice?(message: M): boolean;
  /** The More menu's delete item, where delete is softer than "Delete message". */
  deleteLabel?(message: M): string;
  /** Ask before deleting. */
  deleteConfirm?: { prompt: string; yes: string; no: string };
  /** Every post is a plain comment; an @mention is what puts it on someone's list. */
  post(input: { body: string; mentionedUserIds: string[] }): unknown;
  reply(parent: M, input: { body: string; mentionedUserIds: string[] }): unknown;
  /** Close a Follow-up ask (someone followed up, or the asker withdrew it) or
   *  an @mention (Done from someone it names, or Never mind from its sender).
   *  Either way it closes as the viewer. */
  closeAsk(message: M, how: "followedUp" | "neverMind" | "done"): unknown;
  /** Reopen a closed or withdrawn Follow-up ask (#1496). */
  reopenAsk?(message: M): unknown;
  delete(message: M): unknown;

  // Optional capabilities: a source that sets none of these reads exactly as
  // before. Feedback Follow-ups (Your notes) were the first to use them.

  /** Rewrite a message's body. Where `failure` is set, reject on failure. */
  edit?(message: M, body: string): unknown;
  /** Whether this viewer may edit this message; no Edit control without it. */
  canEdit?(message: M): boolean;
  /** Narrows Delete beyond the model's author-or-Full-timer rule; false hides it. */
  canDelete?(message: M): boolean;
  /** Set when post and edit reject on failure. The stream then keeps a draft
   *  until its write lands, and says this if it doesn't. */
  failure?: { post: string; edit: string };
  /** The composer's own words, where the defaults ("Post", "Write a message")
   *  don't fit. Anything left out keeps the default. */
  composer?: {
    placeholder?: string;
    label?: string;
    submitLabel?: string;
    hint?: string;
    /** The accessible name of the inline editor. */
    editLabel?: string;
    /** Applies to the composer and the inline editor. */
    maxLength?: number;
  };
}
