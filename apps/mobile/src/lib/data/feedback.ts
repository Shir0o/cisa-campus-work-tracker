// Feedback — thin mobile wrapper around the shared @cisa/core logic (behind
// an injected `db`). Submitting also logs the activity + self-notifies,
// mirroring web's SubmitFeedback.tsx (same pattern as data/contacts.ts's
// addContact wrapper) so a new note surfaces in the already-shipped History
// screen and confirms receipt via Notifications.
import * as core from '@cisa/core';
import type { Feedback, FeedbackKind, FeedbackStatus } from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType, sendNotification } from '../firebase';

export function subscribeFeedback(
  cb: (list: Feedback[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeFeedback(db, cb, onError);
}

export async function submitFeedback(input: {
  uid: string;
  userEmail: string;
  userName: string;
  kind: FeedbackKind;
  message: string;
  screenshot?: string;
}): Promise<string> {
  try {
    const id = await core.submitFeedback(db, {
      userId: input.uid,
      userEmail: input.userEmail,
      userName: input.userName,
      kind: input.kind,
      message: input.message,
      screenshot: input.screenshot,
    });

    const label = core.kindMeta(input.kind).label;
    void logActivity({
      action: 'submitted feedback',
      targetId: 'feedback_root',
      targetName: label,
      targetType: 'contact',
      type: 'create',
      description: `User left a note (${label}): "${input.message.slice(0, 40)}${input.message.length > 40 ? '...' : ''}"`,
    });
    void sendNotification({
      userId: input.uid,
      title: 'We got your note',
      message: 'Thank you! The application admins have been notified.',
      type: 'success',
    });

    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'feedback');
    throw e;
  }
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  try {
    await core.updateFeedbackStatus(db, id, status);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `feedback/${id}`);
  }
}

export async function toggleFeedbackArchive(id: string, archived: boolean): Promise<void> {
  try {
    await core.toggleFeedbackArchive(db, id, archived);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `feedback/${id}`);
  }
}

export async function deleteFeedback(id: string): Promise<void> {
  try {
    await core.deleteFeedback(db, id);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `feedback/${id}`);
  }
}
