// Gathering events reads — shared Firestore logic behind an injected `db`.
// Mirrors the web app's src/views/Attendance.tsx events subscription.
import { collection, onSnapshot, orderBy, query, type Firestore } from "firebase/firestore";
import type { Event } from "../types";

/** Live subscription to gathering events, ordered date asc then order asc. */
export function subscribeEvents(
  db: Firestore,
  cb: (events: Event[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "events"), orderBy("date", "asc"), orderBy("order", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]),
    (e) => (onError ? onError(e) : console.error("events subscription error", e)),
  );
}
