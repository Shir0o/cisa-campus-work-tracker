// Per-contact team discussion ("Discussion" tab) — thin mobile wrapper
// around the shared @cisa/core logic (behind an injected `db`), composing
// logActivity and a best-effort notification to the contact's creator.
import * as core from '@cisa/core';
import type { Comment } from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType, sendNotification } from '../firebase';

export function subscribeComments(
  contactId: string,
  cb: (comments: Comment[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeComments(db, contactId, cb, onError);
}

export async function addComment(
  contactId: string,
  contact: { name: string; createdBy?: string | null },
  input: { text: string; parentId?: string | null },
  by: { uid: string; name: string; photoURL?: string | null },
): Promise<void> {
  try {
    await core.addComment(db, contactId, input, by);
    void logActivity({
      action: 'left a comment on',
      targetId: contactId,
      targetName: contact.name,
      targetType: 'contact',
      type: 'comment',
      description: input.text.trim(),
    });
    if (contact.createdBy && contact.createdBy !== by.uid) {
      const text = input.text.trim();
      void sendNotification({
        userId: contact.createdBy,
        title: 'New Comment',
        message: `${by.name} commented on ${contact.name}: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`,
        type: 'info',
        link: '/directory',
        targetId: contactId,
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/comments`);
  }
}
