import { InboxState } from "./inboxState";

export const FOLLOW_UP_STACK_PREFIX = "att:contact:";

/**
 * "I followed up" on a person-row dropdown (#1069): complete the person's
 * worklist item through the same server-backed axis the worklist card uses, so
 * the "N to work through" count falls and a reload keeps it. Returns the undo,
 * which the caller offers in its snackbar.
 *
 * The row action used to write `contact:<id>` and the bare id into the local
 * per-device store — refs nothing reads. The completion axis lives on the
 * server under `inboxState/{uid}` at the stack id `att:contact:<id>`.
 */
export function followUpContact(uid: string, contactId: string): () => void {
  const stackId = `${FOLLOW_UP_STACK_PREFIX}${contactId}`;
  InboxState.markCompleted(uid, stackId);
  return () => InboxState.undoCompleted(uid, stackId);
}