// Hospitality offers — a Community member telling the team when they have room
// at their table. Shared Firestore logic behind an injected `db`.
//
// The doc id IS the uid (hospitalityOffers/{uid}), so a household has one
// standing offer that gets updated rather than a pile of stale ones, and the
// owner rule is a plain `isOwner(uid)` with no field check.
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { HospitalityOffer } from "../types";

const col = (db: Firestore) => collection(db, "hospitalityOffers");
const ref = (db: Firestore, uid: string) => doc(db, "hospitalityOffers", uid);

const toOffer = (uid: string, data: Partial<HospitalityOffer>): HospitalityOffer => ({
  uid,
  name: data.name ?? "Someone",
  availability: data.availability ?? [],
  seats: data.seats ?? "",
  note: data.note ?? "",
  updatedAt: data.updatedAt ?? new Date().toISOString(),
});

/** My own standing offer, or null if I haven't made one. */
export function subscribeMyHospitalityOffer(
  db: Firestore,
  uid: string,
  cb: (offer: HospitalityOffer | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    ref(db, uid),
    (snap) =>
      cb(snap.exists() ? toOffer(snap.id, snap.data() as Partial<HospitalityOffer>) : null),
    (e) => (onError ? onError(e) : console.error("hospitality offer subscription error", e)),
  );
}

/** Every open home, for the Full-timer home's "Homes open to students". */
export function subscribeHospitalityOffers(
  db: Firestore,
  cb: (offers: HospitalityOffer[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    col(db),
    (snap) => cb(snap.docs.map((d) => toOffer(d.id, d.data() as Partial<HospitalityOffer>))),
    (e) => (onError ? onError(e) : console.error("hospitality offers subscription error", e)),
  );
}

export async function saveHospitalityOffer(
  db: Firestore,
  uid: string,
  input: { name: string; availability: string[]; seats: string; note: string },
): Promise<void> {
  await setDoc(ref(db, uid), {
    uid,
    name: input.name.trim() || "Someone",
    availability: input.availability,
    seats: input.seats.trim(),
    note: input.note.trim(),
    updatedAt: new Date().toISOString(),
  });
}

/** Withdrawing the offer — "we're out of room for now". */
export async function deleteHospitalityOffer(db: Firestore, uid: string): Promise<void> {
  await deleteDoc(ref(db, uid));
}
