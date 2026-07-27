// Prayer requests — a member asking the team to pray for them. Shared Firestore
// logic behind an injected `db`. Lives at prayerRequests/{id}: the asker owns
// their own rows, staff (manager and up) read all of them, which is what makes
// the ask land somewhere real instead of on the phone that sent it.
//
// Not `users/{uid}/prayerRequests` like personalPrayers, precisely because
// personal prayers are private and these are not: a top-level collection is
// what lets the Full-timer home list every open ask in one subscription.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import type { PrayerRequest } from "../types";

const col = (db: Firestore) => collection(db, "prayerRequests");
const ref = (db: Firestore, id: string) => doc(db, "prayerRequests", id);

const toRequest = (id: string, data: Partial<PrayerRequest>): PrayerRequest => ({
  id,
  uid: data.uid ?? "",
  name: data.name ?? "Someone",
  body: data.body ?? "",
  status: data.status ?? "open",
  createdAt: data.createdAt ?? new Date().toISOString(),
  updatedAt: data.updatedAt ?? data.createdAt ?? new Date().toISOString(),
});

/** The requests I have made, newest first. */
export function subscribeMyPrayerRequests(
  db: Firestore,
  uid: string,
  cb: (requests: PrayerRequest[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(db), where("uid", "==", uid), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => toRequest(d.id, d.data() as Partial<PrayerRequest>))),
    (e) => (onError ? onError(e) : console.error("prayerRequests subscription error", e)),
  );
}

/** Every open request, for the Full-timer home's "Prayers to carry". */
export function subscribeOpenPrayerRequests(
  db: Firestore,
  cb: (requests: PrayerRequest[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(db), where("status", "==", "open"), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => toRequest(d.id, d.data() as Partial<PrayerRequest>))),
    (e) => (onError ? onError(e) : console.error("open prayerRequests subscription error", e)),
  );
}

export async function addPrayerRequest(
  db: Firestore,
  input: { uid: string; name: string; body: string },
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(col(db), {
    uid: input.uid,
    name: input.name.trim() || "Someone",
    body: input.body.trim(),
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
}

export async function setPrayerRequestStatus(
  db: Firestore,
  id: string,
  status: PrayerRequest["status"],
): Promise<void> {
  await updateDoc(ref(db, id), { status, updatedAt: new Date().toISOString() });
}

export async function deletePrayerRequest(db: Firestore, id: string): Promise<void> {
  await deleteDoc(ref(db, id));
}
