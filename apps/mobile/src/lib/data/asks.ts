// "Ask the team" (#545) reads/writes — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { AskMessage } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

export type { AskMessage, SubscribeAsksOptions, AskOriginResult } from '@cisa/core';
export {
  askQuestions,
  askQuestionsBy,
  askRepliesOf,
  askAnswered,
  askWaitedWords,
  askStacksFor,
  askTakenBy,
  askOrigin,
  askVisibleFor,
  askUnreadFor,
  type AskStack,
} from '@cisa/core';

/** Live subscription to ask-the-team messages (questions + answers).
 *  Full-timers read all; non-admins are scoped by `where("owner", "==", uid)`. */
export function subscribeAsks(
  cb: (messages: AskMessage[]) => void,
  onErrorOrOptions?: ((e: unknown) => void) | core.SubscribeAsksOptions | null,
  options?: core.SubscribeAsksOptions,
): () => void {
  return core.subscribeAsks(db, cb, onErrorOrOptions as never, options);
}

/** Live subscription to the team-wide ask feed for a staff member (a
 *  trainee's view of the whole team's questions + answers). */
export function subscribeStaffAsks(
  uid: string,
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeStaffAsks(db, uid, cb, onError);
}

/** Ask a question. */
export async function addAsk(input: {
  from: string;
  fromName: string;
  body: string;
}): Promise<void> {
  try {
    await core.addAsk(db, input);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'asks');
  }
}

/** Record a question asked in person (#563) on behalf of a trainee. */
export async function addAskFor(input: {
  askerId: string;
  askerName: string;
  takenBy: string;
  takenByName: string;
  body: string;
}): Promise<void> {
  try {
    await core.addAskFor(db, input);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'asks');
  }
}

/** Answer a question; pings the asker's bell when `notifyTo` is set. */
export async function addAskReply(
  parentId: string,
  input: { from: string; fromName: string; body: string },
  owner: string,
  notifyTo?: string | null,
): Promise<void> {
  try {
    await core.addAskReply(db, parentId, input, owner, notifyTo, (payload) =>
      void sendNotification(payload),
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'asks');
  }
}

/** Delete a single reply on a question, leaving the question itself in place
 *  (#680). The Firestore rule permits `isAdmin() || existing().owner == uid`
 *  — the asker (who is the reply's `owner` since every reply inherits the
 *  asker's owner) and any full-timer can drop just this one doc. */
export async function deleteAskReply(replyId: string): Promise<void> {
  try {
    await core.deleteAskReply(db, replyId);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `asks/${replyId}`);
  }
}