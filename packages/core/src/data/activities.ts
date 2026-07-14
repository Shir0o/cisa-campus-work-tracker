// System activity feed reads — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/views/History.tsx activities subscription.
import { collection, limit, onSnapshot, orderBy, query, type Firestore } from "firebase/firestore";
import type { SystemActivity } from "../types";
import type { Hist } from "../history";

/** Live subscription to the most recent 100 logged activities, newest first. */
export function subscribeActivities(
  db: Firestore,
  cb: (activities: Hist[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "activities"), orderBy("createdAt", "desc"), limit(100)),
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data() as SystemActivity;
          return {
            id: d.id,
            user: data.userName,
            userPhoto: data.userPhoto,
            action: data.action,
            target: data.targetName,
            contactId: data.targetType === "contact" ? data.targetId : undefined,
            type: data.type,
            description: data.description,
            createdAt: data.createdAt,
          } as Hist;
        }),
      );
    },
    (e) => (onError ? onError(e) : console.error("activities subscription error", e)),
  );
}
