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
 * screen's Conversation and Story Threads, plus the Full-timers stream when
 * `includeTeam` (a Full-timer only; the rules refuse anyone else). */
export function subscribeThreads(
  contactId: string,
  cb: (messages: ThreadMessage[]) => void,
  onError?: (e: unknown) => void,
  options?: core.ThreadSubscribeOptions,
): () => void {
  return core.subscribeThreads(db, contactId, cb, onError, options);
}

const sub = (scope?: 'team' | null) => (scope === 'team' ? 'teamThreads' : 'threads');

/** Delete a single thread message — the author or an admin (per firestore.rules). */
export async function deleteThreadMessage(
  contactId: string,
  messageId: string,
  scope?: 'team' | null,
): Promise<void> {
  try {
    await core.deleteThreadMessage(db, contactId, messageId, scope);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `contacts/${contactId}/${sub(scope)}/${messageId}`);
  }
}

/** I followed up / Never mind on a Follow-up ask, as `by` (#813). */
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

/** Post a new message to a contact; pings everyone tied to it. The bell entry
 *  is pushed by the notification function, held to one push per contact per
 *  person per hour so a back-and-forth does not buzz a Trainee eight times
 *  (#813). */
export async function addThreadMessage(
  contactId: string,
  input: {
    interactionId?: string | null;
    parentId?: string | null;
    scope?: 'team' | null;
    from: string;
    fromName: string;
    kind: ThreadKind;
    body: string;
    /** Teammates @mentioned, already reconciled against the body (ADR 0007). */
    mentionedUserIds?: string[];
  },
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
        link: `/people/${contactId}?tab=${input.scope === 'team' ? 'discussion' : 'thread'}`,
        coalesceKey: `contact:${contactId}`,
      });
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/${sub(input.scope)}`);
  }
}
