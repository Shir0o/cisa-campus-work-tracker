import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";

// Event RSVPs live under events/{eventId}/rsvps/{uid} — one doc per attendee,
// keyed by uid so a person can RSVP at most once. Un-RSVP deletes the doc.
// Students and Community members RSVP from their landing; staff read the counts.
export interface Rsvp {
  uid: string;
  name: string;
  status: "going";
  createdAt?: unknown;
}

const rsvpRef = (eventId: string, uid: string) => doc(db, "events", eventId, "rsvps", uid);

// Create (going) or delete (not going) the current user's RSVP for an event.
export async function setRsvp(
  eventId: string,
  user: { uid: string; name: string },
  going: boolean,
): Promise<void> {
  try {
    if (going) {
      await setDoc(rsvpRef(eventId, user.uid), {
        uid: user.uid,
        name: user.name,
        status: "going",
        createdAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(rsvpRef(eventId, user.uid));
    }
  } catch (e) {
    handleFirestoreError(
      e,
      going ? OperationType.CREATE : OperationType.DELETE,
      `events/${eventId}/rsvps/${user.uid}`,
    );
  }
}

// All RSVPs for one event (for the staff "who's coming" count).
export function subscribeEventRsvps(
  eventId: string,
  cb: (rsvps: Rsvp[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db, "events", eventId, "rsvps"),
    (snap) => cb(snap.docs.map((d) => d.data() as Rsvp)),
    (e) => (onError ? onError(e) : console.error("event rsvps subscription error", e)),
  );
}

// The set of event ids the current user has RSVP'd "going" to — a single
// collection-group query across every event's rsvps subcollection.
export function subscribeMyRsvps(
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
