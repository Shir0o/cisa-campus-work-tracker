// The write every contact stream shares: one message into the contact's
// `threads` or `teamThreads` subcollection through the existing data layer, with
// the notify options each adapter used to repeat. No path, shape or rule
// changes — only one place that calls addThreadMessage for the streams.
import { addThreadMessage, type ThreadMessage, type ThreadStakeholders } from "../../lib/threads";

export interface ContactWriteContext {
  contactId: string;
  contactName: string;
  me: { uid: string; name: string };
  /** Legacy single recipient, passed through to the notify path unchanged. */
  recipientUid?: string | null;
  stakeholders?: ThreadStakeholders | null;
  /** Told what was just posted, before the write returns, so a surface can show
   *  it at once. `landed` resolves to the id the write really got (#1012). */
  onPosted?: (message: ThreadMessage, landed: Promise<string | null>) => void;
}

export interface ContactWrite {
  interactionId: string | null;
  scope: "team" | null;
  parentId: string | null;
  kind: ThreadMessage["kind"];
  body: string;
  mentionedUserIds: string[];
}

export function contactWriter({ contactId, contactName, me, recipientUid, stakeholders, onPosted }: ContactWriteContext) {
  const notify = { to: recipientUid ?? null, contactName, ...(stakeholders ? { stakeholders } : {}) };
  return (input: ContactWrite) => {
    const landed = addThreadMessage(contactId, { from: me.uid, fromName: me.name, ...input }, notify);
    // A placeholder id the caller swaps for the real one when `landed` resolves.
    const { mentionedUserIds, ...rest } = input;
    onPosted?.(
      {
        id: `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        from: me.uid,
        fromName: me.name,
        at: new Date().toISOString(),
        ...rest,
        ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
      },
      landed,
    );
    return landed;
  };
}
