// The Conversation adapter: a contact's open stream (contacts/{id}/threads,
// contact-level) over the existing thread data layer. No path, shape or rule
// changes — only a new caller for each operation.
import {
  closeFollowUpAsk,
  deleteThreadMessage,
  editThreadMessage,
  type ThreadMessage,
  type ThreadStakeholders,
} from "../../lib/threads";
import { contactWriter } from "./contactWriter";
import type { StreamAdapter } from "./types";

/** Operator or above may write a contact's stream — the rules' `isOperator()`. */
export const WRITERS = new Set(["admin", "manager", "operator"]);

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
  /** Told what was just posted, so a surface can show it before the write returns. */
  onPosted?: (message: ThreadMessage, landed: Promise<string | null>) => void;
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
  onPosted,
  t,
}: ConversationAdapterInput): StreamAdapter<ThreadMessage> {
  const first = (contactName || "").trim().split(/\s+/)[0] || contactName;
  const mayWrite = WRITERS.has(me.role ?? "");
  const write = contactWriter({ contactId, contactName, me, recipientUid, stakeholders, onPosted });

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
    post: ({ body, kind, mentionedUserIds }) =>
      write({ interactionId: null, scope: null, parentId: null, kind, body, mentionedUserIds }),
    // A reply never closes the ask it answers: only I followed up or Never
    // mind does (#813).
    reply: (parent, { body, mentionedUserIds }) =>
      write({ interactionId: null, scope: null, parentId: parent.id, kind: "comment", body, mentionedUserIds }),
    // Both close the ask as the viewer. Only the asker is offered Never mind,
    // and an ask closed by its own asker is what reads as withdrawn.
    closeAsk: (m) => closeFollowUpAsk(contactId, m.id, { uid: me.uid, name: me.name }),
    delete: (m) => deleteThreadMessage(contactId, m.id, m.scope),
    // A rewrite is the author's alone — unlike delete, which a Full-timer may
    // also do. The rule enforces the same; the control must not promise more.
    canEdit: (m) => m.from === me.uid,
    edit: (m, body) => editThreadMessage(contactId, m.id, body),
    failure: { post: t("stream.post_failed"), edit: t("stream.edit_failed") },
  };
}
