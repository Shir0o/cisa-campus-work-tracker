// Event RSVP reads/writes — shared Firestore logic behind an injected `db`.
// Mirrors the web app's src/lib/rsvp.ts (the pure Rsvp type + selection logic
// live in ../rsvp).
import {
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";

const rsvpRef = (db: Firestore, eventId: string, uid: string) =>
  doc(db, "events", eventId, "rsvps", uid);

/** Create (going) or delete (not going) the current user's RSVP for an event. */
export async function setRsvp(
  db: Firestore,
  eventId: string,
  user: { uid: string; name: string },
  going: boolean,
): Promise<void> {
  if (going) {
    await setDoc(rsvpRef(db, eventId, user.uid), {
      uid: user.uid,
      name: user.name,
      status: "going",
      createdAt: serverTimestamp(),
    });
  } else {
    await deleteDoc(rsvpRef(db, eventId, user.uid));
  }
}

/** The set of event ids the current user has RSVP'd "going" to — a single
 * collection-group query across every event's rsvps subcollection. */
export function subscribeMyRsvps(
  db: Firestore,
  uid: string,
  cb: (eventIds: Set<string>) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collectionGroup(db, "rsvps"), where("uid", "==", uid)),
    (snap) => {
      const ids = new Set<string>();
      for (const d of snap.docs) {
        const eventId = d.ref.parent.parent?.id;
        if (eventId) ids.add(eventId);
      }
      cb(ids);
    },
    (e) => (onError ? onError(e) : console.error("my rsvps subscription error", e)),
  );
}
