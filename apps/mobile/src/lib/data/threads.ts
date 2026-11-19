// "Walking together" thread reads/writes for the "From the team" inbox —
// thin mobile wrapper around the shared @cisa/core logic (behind an injected
// `db`). Notification-sending stays mobile-specific (wired via onNotify).
import * as core from '@cisa/core';
import type { ThreadKind, ThreadMessage, ThreadMessageWithContact } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

/** Live subscription to every thread message across all contacts, tagged with
 * contactId. */
export function subscribeAllThreads(
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeAllThreads(db, cb, onError);
}

/** A Trainee's thread messages across the people they can see (the rules deny
 * them the collection-group feed). */
export function subscribeTiedThreads(
  staffId: string,
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeTiedThreads(db, staffId, cb, onError);
}

/** Live subscription to a single contact's thread messages — the person
 * screen's Conversation and the story. */
export function subscribeThreads(
  contactId: string,
  cb: (messages: ThreadMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeThreads(db, contactId, cb, onError);
}

/** Delete a single thread message — the author or an admin (per firestore.rules). */
export async function deleteThreadMessage(
  contactId: string,
  messageId: string,
): Promise<void> {
  try {
    await core.deleteThreadMessage(db, contactId, messageId);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `contacts/${contactId}/threads/${messageId}`);
  }
}

/** Rewrite a message's body as its author, stamping `editedAt`. Only the author
 *  may (per firestore.rules); the editor stays open when this rejects. */
export async function editThreadMessage(
  contactId: string,
  messageId: string,
  body: string,
): Promise<void> {
  try {
    await core.editThreadMessage(db, contactId, messageId, body);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contactId}/threads/${messageId}`);
  }
}

/** I followed up / Never mind on a Follow-up ask, or Done / Never mind on an
 *  @mention, as `by` (#813). */
export async function closeFollowUpAsk(
  contactId: string,
  messageId: string,
  by: { uid: string; name?: string | null },
): Promise<void> {
  try {
    await core.closeFollowUpAsk(db, contactId, messageId, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contactId}/threads/${messageId}`);
  }
}

/** Where a bell entry about a written message opens, as a web path both apps
 *  read. Mirrors the web app's `threadNotificationLink` (#1303). */
export function threadNotificationLink(
  contactId: string,
  input: { interactionId?: string | null; parentId?: string | null },
): string {
  if (input.interactionId) return `/people/${contactId}?interaction=${input.interactionId}`;
  return `/people/${contactId}?tab=thread${input.parentId ? `&parent=${input.parentId}` : ''}`;
}

/** Post a new message to a contact; an @mention pings the person it names and
 *  nothing else does (cut-or-keep §28). The bell entry is pushed by the
 *  notification function. */
export async function addThreadMessage(
  contactId: string,
  input: {
    interactionId?: string | null;
    parentId?: string | null;
    from: string;
    fromName: string;
    kind: ThreadKind;
    body: string;
    /** Teammates @mentioned, already reconciled against the body (ADR 0007). */
    mentionedUserIds?: string[];
  },
  notify?: {
    /** The person's name, so a mention reads "mentioned you on <name>". */
    contactName?: string;
  },
): Promise<void> {
  try {
    await core.addThreadMessage(db, contactId, input, notify, (payload) => {
      void sendNotification({
        ...payload,
        link: threadNotificationLink(contactId, input),
      });
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/threads`);
  }
}
