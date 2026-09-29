// The Conversation adapter: a contact's open stream (contacts/{id}/threads,
// contact-level) over the existing thread data layer. No path, shape or rule
// changes — only a new caller for each operation.
import {
  addThreadMessage,
  closeFollowUpAsk,
  deleteThreadMessage,
  type ThreadMessage,
  type ThreadStakeholders,
} from "../../lib/threads";
import type { StreamAdapter } from "./types";

const WRITERS = new Set(["admin", "manager", "operator"]);

export interface ConversationAdapterInput {
  contactId: string;
  contactName: string;
  /** The contact's thread messages as the page already holds them — every
   *  scope and level; this adapter keeps the Conversation's own. */
  messages: ThreadMessage[];
  me: { uid: string; name: string; role?: string | null };
  /** Legacy single recipient, passed through to the notify path unchanged. */
  recipientUid?: string | null;
  stakeholders?: ThreadStakeholders | null;
  teamMembers: { id: string; name: string; role?: string }[];
  t: (key: string) => string;
}

export function conversationAdapter({
  contactId,
  contactName,
  messages,
  me,
  recipientUid,
  stakeholders,
  teamMembers,
  t,
}: ConversationAdapterInput): StreamAdapter<ThreadMessage> {
  const first = (contactName || "").trim().split(/\s+/)[0] || contactName;
  const mayWrite = WRITERS.has(me.role ?? "");
  const notify = { to: recipientUid ?? null, contactName, ...(stakeholders ? { stakeholders } : {}) };
  const write = (input: { parentId: string | null; kind: ThreadMessage["kind"]; body: string; mentionedUserIds: string[] }) =>
    addThreadMessage(
      contactId,
      { interactionId: null, scope: null, from: me.uid, fromName: me.name, ...input },
      notify,
    );

  return {
    messages: messages.filter((m) => !m.interactionId && !m.scope),
    name: t("modals.contactDetails.follow_up"),
    where: t("stream.where_conversation").replace("{name}", contactName),
    audience: t("stream.audience_conversation").replace("{name}", first),
    askAudience: t("stream.audience_conversation_ask").replace("{name}", first),
    empty: t("thread.empty_conversation"),
    capabilities: { kinds: true, attachments: false, canPost: mayWrite, canReply: mayWrite },
    // Any teammate, as before (ADR 0007): an @mention can pull in someone not
    // yet tied to the person.
    mentionCandidates: teamMembers.map((m) => ({ uid: m.id, name: m.name, role: m.role })),
    post: ({ body, kind, mentionedUserIds }) => write({ parentId: null, kind, body, mentionedUserIds }),
    // A reply never closes the ask it answers: only I followed up or Never
    // mind does (#813).
    reply: (parent, { body, mentionedUserIds }) => write({ parentId: parent.id, kind: "comment", body, mentionedUserIds }),
    // Both close the ask as the viewer. Only the asker is offered Never mind,
    // and an ask closed by its own asker is what reads as withdrawn.
    closeAsk: (m) => closeFollowUpAsk(contactId, m.id, { uid: me.uid, name: me.name }),
    delete: (m) => deleteThreadMessage(contactId, m.id, m.scope),
  };
}
