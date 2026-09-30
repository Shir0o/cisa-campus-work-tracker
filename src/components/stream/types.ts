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
export type StreamSourceMessage = StreamMessage;

/** The three kinds a Conversation composer offers (#813); `nudge` is a
 *  Follow-up ask. A source without kinds only ever posts `comment`. */
export type StreamComposeKind = "comment" | "question" | "nudge";

export interface StreamCapabilities {
  /** Comment · Question · Ask a follow-up chips in the composer. */
  kinds: boolean;
  /** An attach button in the tools row. No contact stream has one. */
  attachments: boolean;
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
  /** The same line while a Follow-up ask is being written, when it differs. */
  askAudience?: string;
  /** Shown above the audience line when the stream is restricted. */
  locked?: boolean;
  /** What an empty stream says. */
  empty?: string;
  capabilities: StreamCapabilities;
  /** Who may be @mentioned here (ADR 0007), already cut to this stream. */
  mentionCandidates: MentionUser[];
  /** The viewer's last-read point, where the source has read state. */
  lastReadAt?: string | null;
  post(input: { body: string; kind: StreamComposeKind; mentionedUserIds: string[] }): unknown;
  reply(parent: M, input: { body: string; mentionedUserIds: string[] }): unknown;
  /** Close a Follow-up ask: someone followed up, or the asker withdrew it. */
  closeAsk(message: M, how: "followedUp" | "neverMind"): unknown;
  delete(message: M): unknown;
}
