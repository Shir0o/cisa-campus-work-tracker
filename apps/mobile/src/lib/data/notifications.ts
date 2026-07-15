// Notifications — thin mobile wrapper around the shared @cisa/core logic
// (behind an injected `db`).
import * as core from '@cisa/core';
import type { Notification } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

/** Live subscription to the signed-in user's personal + broadcast notifications. */
export function subscribeNotifications(
  uid: string,
  cb: (list: Notification[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeNotifications(db, uid, cb, onError);
}

export async function markNotificationRead(id: string, uid: string): Promise<void> {
  try {
    await core.markNotificationRead(db, id, uid);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`);
  }
}

export async function markAllNotificationsRead(ids: string[], uid: string): Promise<void> {
  try {
    await core.markAllNotificationsRead(db, ids, uid);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, 'notifications');
  }
}

export async function setAsideNotification(
  notif: Pick<Notification, 'id' | 'userId'>,
  uid: string,
): Promise<void> {
  try {
    await core.setAsideNotification(db, notif, uid);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `notifications/${notif.id}`);
  }
}
