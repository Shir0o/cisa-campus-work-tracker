// Notifications — Firestore reads/writes behind an injected `db`. Mirrors
// the web app's src/components/layout/NotificationCenter.tsx (personal +
// broadcast query merge, mark-read, mark-all-read, set-aside).
import {
  arrayUnion, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { Notification } from "../types";
import { mergeNotifications } from "../notifications";

/**
 * Live-merges the personal (userId == uid) and broadcast (userId ==
 * 'ALL_ADMINS') notification queries, each ordered newest-first and capped
 * at 20, filtering out anything the caller has dismissed. Calls `cb` with
 * the combined, sorted, re-capped list whenever either query updates.
 */
export function subscribeNotifications(
  db: Firestore,
  uid: string,
  cb: (list: Notification[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  let personal: Notification[] = [];
  let broadcast: Notification[] = [];

  const emit = () => cb(mergeNotifications(personal, broadcast));

  const mapDoc = (d: any): Notification => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      read: data.readBy?.includes(uid) ?? data.read,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    };
  };

  const qPersonal = query(
    collection(db, "notifications"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
    limit(20),
  );
  const qBroadcast = query(
    collection(db, "notifications"),
    where("userId", "==", "ALL_ADMINS"),
    orderBy("createdAt", "desc"),
    limit(20),
  );

  const onErr = (e: unknown) => (onError ? onError(e) : console.error("notifications subscription error", e));

  const unsubPersonal = onSnapshot(qPersonal, (snap) => {
    personal = snap.docs
      .map(mapDoc)
      .filter((n) => !n.dismissedBy?.includes(uid));
    emit();
  }, onErr);

  const unsubBroadcast = onSnapshot(qBroadcast, (snap) => {
    broadcast = snap.docs
      .map(mapDoc)
      .filter((n) => !n.dismissedBy?.includes(uid));
    emit();
  }, onErr);

  return () => { unsubPersonal(); unsubBroadcast(); };
}

/** Marks a single notification read for `uid` (mirrors web's markAsRead). */
export async function markNotificationRead(db: Firestore, id: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "notifications", id), {
    read: true,
    readBy: arrayUnion(uid),
  });
}

/** Marks every id in `ids` read for `uid` in one batch (mirrors web's markAllAsRead). */
export async function markAllNotificationsRead(db: Firestore, ids: string[], uid: string): Promise<void> {
  const batch = writeBatch(db);
  ids.forEach((id) => {
    batch.update(doc(db, "notifications", id), {
      read: true,
      readBy: arrayUnion(uid),
    });
  });
  await batch.commit();
}

/**
 * "Sets aside" a notification for `uid` — hard-deletes personal
 * notifications, or marks a broadcast notification dismissed for just this
 * user (mirrors web's setAside).
 */
export async function setAsideNotification(
  db: Firestore,
  notif: Pick<Notification, "id" | "userId">,
  uid: string,
): Promise<void> {
  if (notif.userId === "ALL_ADMINS") {
    await updateDoc(doc(db, "notifications", notif.id), {
      dismissedBy: arrayUnion(uid),
    });
  } else {
    await deleteDoc(doc(db, "notifications", notif.id));
  }
}
