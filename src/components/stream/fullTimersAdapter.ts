// The Full-timers adapter: the staff-only stream (contacts/{id}/teamThreads)
// over the existing thread data layer. No path, shape or rule changes. It has
// no kinds — a Follow-up ask belongs where everyone tied can see it — and only
// Full-timers may be @mentioned in it (ADR 0007).
import { deleteThreadMessage, type ThreadMessage, type ThreadStakeholders } from "../../lib/threads";
import { isFullTimer } from "../../lib/walking";
import { contactWriter } from "./contactWriter";
import type { StreamAdapter } from "./types";

export interface FullTimersMember {
  id: string;
  name: string;
  /** A display label ("Full-timer") or a raw role ("admin"). */
  role?: string;
  /** Known outright by a caller that has the raw role; wins over the label. */
  fullTimer?: boolean;
}

export interface FullTimersAdapterInput {
  contactId: string;
  contactName: string;
  /** The contact's thread messages as the page already holds them; this
   *  adapter keeps the team-scope ones. */
  messages: ThreadMessage[];
  me: { uid: string; name: string; role?: string | null };
  recipientUid?: string | null;
  stakeholders?: ThreadStakeholders | null;
  teamMembers: FullTimersMember[];
  onPosted?: (message: ThreadMessage, landed: Promise<string | null>) => void;
  t: (key: string) => string;
}

/** Whether a roster entry is a Full-timer — by its flag, else by its label or
 *  the roster, as the renderer this replaces decided it. */
export const isFullTimerMember = (m: FullTimersMember): boolean =>
  m.fullTimer ?? (m.role === "Full-timer" || m.role === "admin" || m.role === "full_timer" || isFullTimer(m.id));

export function fullTimersAdapter({
  contactId,
  contactName,
  messages,
  me,
  recipientUid,
  stakeholders,
  teamMembers,
  onPosted,
  t,
}: FullTimersAdapterInput): StreamAdapter<ThreadMessage> {
  // Only a Full-timer may write here; the rules say the same.
  const mayWrite = me.role === "admin";
  const write = contactWriter({ contactId, contactName, me, recipientUid, stakeholders, onPosted });

  return {
    messages: messages.filter((m) => !m.interactionId && m.scope === "team"),
    name: t("modals.contactDetails.discussion"),
    where: t("stream.where_full_timers").replace("{name}", contactName),
    audience: t("stream.audience_full_timers"),
    locked: true,
    empty: t("thread.empty_full_timers"),
    // No kind chip to supply a placeholder, so it says its own.
    composer: { placeholder: t("stream.placeholder_full_timers") },
    capabilities: { kinds: false, attachments: false, canPost: mayWrite, canReply: mayWrite },
    mentionCandidates: teamMembers
      .filter(isFullTimerMember)
      .map((m) => ({ uid: m.id, name: m.name, role: m.role })),
    // A source without kinds only ever posts a comment.
    post: ({ body, mentionedUserIds }) =>
      write({ interactionId: null, scope: "team", parentId: null, kind: "comment", body, mentionedUserIds }),
    reply: (parent, { body, mentionedUserIds }) =>
      write({ interactionId: null, scope: "team", parentId: parent.id, kind: "comment", body, mentionedUserIds }),
    // Nothing here is ever an ask: with no kinds, only comments are written.
    closeAsk: () => undefined,
    delete: (m) => deleteThreadMessage(contactId, m.id, "team"),
  };
}
