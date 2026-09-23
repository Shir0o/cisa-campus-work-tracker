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

/** Delete a single thread message — the author or an admin (per firestore.rules). */
export async function deleteThreadMessage(contactId: string, messageId: string): Promise<void> {
  try {
    await core.deleteThreadMessage(db, contactId, messageId);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `contacts/${contactId}/threads/${messageId}`);
  }
}

/** Post a new message to a contact; pings everyone tied to it. The bell entry
 *  is pushed by the notification function, held to one push per contact per
 *  person per hour so a back-and-forth does not buzz a Trainee eight times
 *  (#813). */
export async function addThreadMessage(
  contactId: string,
  input: { interactionId?: string | null; from: string; fromName: string; kind: ThreadKind; body: string },
  notify?: {
    to?: string | null;
    contactName?: string;
    stakeholders?: core.ThreadStakeholders | null;
  },
): Promise<void> {
  try {
    await core.addThreadMessage(db, contactId, input, notify, (payload) => {
      void sendNotification({
        ...payload,
        link: `/people/${contactId}?tab=thread`,
        coalesceKey: `contact:${contactId}`,
      });
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/threads`);
  }
}
