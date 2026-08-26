// "Ask the team" (#545) reads/writes — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { AskMessage } from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

export type { AskMessage } from '@cisa/core';
export {
  askQuestions,
  askQuestionsBy,
  askRepliesOf,
  askAnswered,
  askWaitedWords,
  askStacksFor,
  askTakenBy,
  askVisibleFor,
  askUnreadFor,
  type AskStack,
} from '@cisa/core';

/** Live subscription to every ask-the-team message (full-timers). */
export function subscribeAsks(
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeAsks(db, cb, onError);
}

/** Live subscription to my own ask-the-team messages (a trainee). */
export function subscribeMyAsks(
  uid: string,
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeMyAsks(db, uid, cb, onError);
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