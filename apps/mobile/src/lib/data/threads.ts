// "Walking together" thread reads/writes for the "From the team" inbox —
// thin mobile wrapper around the shared @cisa/core logic (behind an injected
// `db`). Notification-sending stays mobile-specific (wired via onNotify).
import * as core from '@cisa/core';
import type { ThreadKind, ThreadMessageWithContact } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

/** Live subscription to every thread message across all contacts, tagged with contactId. */
export function subscribeAllThreads(
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeAllThreads(db, cb, onError);
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
