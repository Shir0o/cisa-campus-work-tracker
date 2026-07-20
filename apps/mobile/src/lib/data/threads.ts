// "Walking together" thread reads/writes for the "From the team" inbox —
// thin mobile wrapper around the shared @cisa/core logic (behind an injected
// `db`). Notification-sending stays mobile-specific (wired via onNotify).
import * as core from '@cisa/core';
import type { ThreadKind, ThreadMessage, ThreadMessageWithContact } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

/** Live subscription to every thread message across all contacts, tagged with contactId. */
export function subscribeAllThreads(
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeAllThreads(db, cb, onError);
}

/** Live subscription to a single contact's thread messages (Contact Detail's
 * "Alongside" tab). */
export function subscribeThreads(
  contactId: string,
  cb: (messages: ThreadMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeThreads(db, contactId, cb, onError);
}

/** Toggle `by`'s reaction on a thread message. */
export async function toggleReaction(contactId: string, messageId: string, by: string, emoji: string): Promise<void> {
  try {
    await core.toggleReaction(db, contactId, messageId, by, emoji);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contactId}/threads/${messageId}`);
  }
}

/** Post a new message to a contact; pings `notify.to`'s bell when set. */
export async function addThreadMessage(
  contactId: string,
  input: { interactionId?: string | null; from: string; fromName: string; kind: ThreadKind; body: string },
  notify?: { to?: string | null; contactName?: string },
): Promise<void> {
  try {
    await core.addThreadMessage(db, contactId, input, notify, (payload) => void sendNotification(payload));
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/threads`);
  }
}
