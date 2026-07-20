// System activity feed reads — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/views/History.tsx activities subscription.
import { collection, limit, onSnapshot, orderBy, query, where, type Firestore } from "firebase/firestore";
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
