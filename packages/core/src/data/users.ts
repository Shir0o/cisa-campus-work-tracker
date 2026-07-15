// Full-timer roster read — shared Firestore logic behind an injected `db`.
// Mirrors src/views/landings/LandingCommunity.tsx's "Reach out" section query.
import { collection, onSnapshot, query, where, type Firestore } from "firebase/firestore";

export interface FullTimerSummary {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

/** Live subscription to the approved Full-timers (admins), for Community's
 * "Reach out" roster. */
export function subscribeFullTimers(
  db: Firestore,
  cb: (fullTimers: FullTimerSummary[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "users"), where("role", "==", "admin")),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ uid: d.id, ...(d.data() as Record<string, unknown>) }))
          .filter((u) => (u as { approved?: boolean }).approved !== false)
          .map((u) => ({
            uid: u.uid,
            name: (u as { displayName?: string }).displayName || "A Full-timer",
            email: (u as { email?: string }).email || "",
            photoURL: (u as { photoURL?: string }).photoURL || undefined,
          })),
      ),
    (e) => (onError ? onError(e) : console.error("full-timers subscription error", e)),
  );
}
