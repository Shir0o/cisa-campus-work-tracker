// The Interaction-Thread adapter: what the team says about one logged
// Interaction ("think it through together"), over the existing thread data
// layer. Its messages are contact threads with `interactionId` set — no path,
// shape or rule changes. The adapter is itself one Thread: the Interaction is
// the parent, quoted, and everything said about it is a reply.
import {
  closeFollowUpAsk,
  reopenFollowUpAsk,
  deleteThreadMessage,
  editThreadMessage,
  type ThreadMessage,
  type ThreadStakeholders,
} from "../../lib/threads";
import { buildThread, type StreamViewer, type ThreadSummary } from "../../lib/stream";
import { WRITERS } from "./conversationAdapter";
import { contactWriter } from "./contactWriter";
import type { StreamAdapter } from "./types";

/** The fields of a logged Interaction this adapter reads. */
export interface InteractionLike {
  id: string;
  userId?: string;
  userName?: string;
  content: string;
  dateTime: string;
}

export interface InteractionAdapterInput {
  contactId: string;
  contactName: string;
  interaction: InteractionLike;
  /** The contact's thread messages as the page already holds them; this
   *  adapter keeps the ones on this Interaction. */
  messages: ThreadMessage[];
  me: { uid: string; name: string; role?: string | null };
  recipientUid?: string | null;
  stakeholders?: ThreadStakeholders | null;
  teamMembers: { id: string; name: string; role?: string }[];
  /** For the quote's date. */
  locale?: string;
  onPosted?: (message: ThreadMessage, landed: Promise<string | null>) => void;
  t: (key: string) => string;
}

/** The synthetic parent's id: the Interaction, standing where a message would. */
export const interactionParentId = (interactionId: string) => `interaction:${interactionId}`;

const firstNameOf = (name?: string) => (name || "").trim().split(/\s+/)[0];

export function interactionAdapter({
  contactId,
  contactName,
  interaction,
  messages,
  me,
  recipientUid,
  stakeholders,
  teamMembers,
  locale = "en-US",
  onPosted,
  t,
}: InteractionAdapterInput): StreamAdapter<ThreadMessage> {
  const first = firstNameOf(contactName) || contactName;
  const mayWrite = WRITERS.has(me.role ?? "");
  const write = contactWriter({ contactId, contactName, me, recipientUid, stakeholders, onPosted });
  const parentId = interactionParentId(interaction.id);

  const parent: ThreadMessage = {
    id: parentId,
    interactionId: interaction.id,
    parentId: null,
    scope: null,
    from: interaction.userId ?? "",
    fromName: interaction.userName ?? "",
    kind: "comment",
    body: interaction.content,
    at: interaction.dateTime,
  };
  // The data is flat — every message on an Interaction is contact-level — and
  // a legacy reply under one reads as a reply to the Interaction too: a Thread
  // is one level deep.
  const replies = messages
    .filter((m) => m.interactionId === interaction.id && !m.scope)
    .map((m) => ({ ...m, parentId }));

  const date = new Date(interaction.dateTime).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const who = firstNameOf(interaction.userName);
  const label = who
    ? t("stream.interaction_quote").replace("{name}", who).replace("{date}", date)
    : t("stream.interaction_quote_anon").replace("{date}", date);

  const reply = (input: { body: string; mentionedUserIds: string[] }) =>
    write({ interactionId: interaction.id, scope: null, parentId: null, kind: "comment", ...input });

  return {
    messages: [parent, ...replies],
    name: t("stream.thread_title"),
    where: t("stream.where_interaction").replace("{name}", contactName),
    // A Thread-only stream draws no main composer; the subtitle carries this.
    audience: t("stream.thread_on_interaction").replace("{name}", first),
    empty: t("thread.empty_interaction"),
    replyPlaceholder: t("stream.think_together_placeholder"),
    thread: {
      parentId,
      subtitle: t("stream.thread_on_interaction").replace("{name}", first),
      quote: { label, body: interaction.content },
    },
    capabilities: { kinds: false, attachments: false, canPost: mayWrite, canReply: mayWrite },
    mentionCandidates: teamMembers.map((m) => ({ uid: m.id, name: m.name, role: m.role })),
    post: reply,
    reply: (_parent, input) => reply(input),
    // A message written when this composer still offered kinds may be an ask.
    closeAsk: (m) => closeFollowUpAsk(contactId, m.id, { uid: me.uid, name: me.name }),
    reopenAsk: (m) => reopenFollowUpAsk(contactId, m.id),
    delete: (m) => deleteThreadMessage(contactId, m.id, m.scope),
    // A reply is the author's to rewrite. The quoted Interaction stands where a
    // message would, but it is not one: its id is synthetic and it can't be edited.
    canEdit: (m) => !m.id.startsWith("interaction:") && m.from === me.uid,
    edit: (m, body) => editThreadMessage(contactId, m.id, body),
    failure: { post: t("stream.post_failed"), edit: t("stream.edit_failed") },
  };
}

/** What the Interaction's replies chip says on its log / Story entry, or null
 *  when nothing has been said yet ("Think it through together"). */
export function interactionThreadSummary(
  adapter: StreamAdapter<ThreadMessage>,
  viewer: StreamViewer,
  now: number | Date,
): ThreadSummary | null {
  const parentId = adapter.thread?.parentId;
  if (!parentId) return null;
  return buildThread({ messages: adapter.messages, viewer, now }, parentId)?.parent.thread ?? null;
}
