// System activity feed reads — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/views/History.tsx activities subscription.
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where, type Firestore } from "firebase/firestore";
import type { SystemActivity } from "../types";
import type { Hist } from "../history";

const toHist = (id: string, data: SystemActivity): Hist => ({
  id,
  user: data.userName,
  userPhoto: data.userPhoto,
  action: data.action,
  target: data.targetName,
  contactId: data.targetType === "contact" ? data.targetId : undefined,
  type: data.type,
  description: data.description,
  createdAt: data.createdAt,
});

/** Live subscription to the most recent 100 logged activities, newest first. */
export function subscribeActivities(
  db: Firestore,
  cb: (activities: Hist[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "activities"), orderBy("createdAt", "desc"), limit(100)),
    (snap) => cb(snap.docs.map((d) => toHist(d.id, d.data() as SystemActivity))),
    (e) => (onError ? onError(e) : console.error("activities subscription error", e)),
  );
}

/** The newest page of the team's whole record, newest first (#1828).
 *
 * Looking back grows this window with "Show older moments", so it stays the
 * one ordered read the page subscribes to — never a cap on the record. */
export function activitiesPageQuery(db: Firestore, pageSize: number) {
  return query(collection(db, "activities"), orderBy("createdAt", "desc"), limit(pageSize));
}

/** How many moments the whole record holds, in one aggregate read (#1828).
 *
 * The header prints this instead of the loaded page's length: a full window
 * is a page, not a record. */
export async function countActivities(db: Firestore): Promise<number> {
  const snapshot = await getCountFromServer(collection(db, "activities"));
  return snapshot.data().count;
}

/** Live subscription to a single contact's audit history (Contact Detail's
 * "Looking back" tab), newest first. */
export function subscribeContactActivities(
  db: Firestore,
  contactId: string,
  cb: (activities: Hist[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, "activities"),
      where("targetId", "==", contactId),
      orderBy("createdAt", "desc"),
      limit(50),
    ),
    (snap) => cb(snap.docs.map((d) => toHist(d.id, d.data() as SystemActivity))),
    (e) => (onError ? onError(e) : console.error("contact activities subscription error", e)),
  );
}
