import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";

// Personal prayers live privately under users/{uid}/personalPrayers — they are
// the user's own, fully editable and removable, and never shared. They may be
// optionally tagged to a contact (display only); that does NOT create a shared
// prayer in the top-level `prayers` collection.
export type PersonalPrayerStatus = "open" | "answered" | "archived";

export interface PersonalPrayer {
  id: string;
  title: string;
  contactId?: string | null;
  date: string; // ISO
  status: PersonalPrayerStatus;
}

const col = (uid: string) => collection(db, "users", uid, "personalPrayers");
const ref = (uid: string, id: string) => doc(db, "users", uid, "personalPrayers", id);

export function subscribePersonalPrayers(
  uid: string,
  cb: (prayers: PersonalPrayer[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(uid), orderBy("date", "asc")),
    (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PersonalPrayer, "id">) }))),
    (e) => (onError ? onError(e) : console.error("personalPrayers subscription error", e)),
  );
}

export async function addPersonalPrayer(
  uid: string,
  input: { title: string; contactId?: string | null },
): Promise<void> {
  try {
    await addDoc(col(uid), {
      title: input.title.trim(),
      contactId: input.contactId ?? null,
      date: new Date().toISOString(),
      status: "open" as PersonalPrayerStatus,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${uid}/personalPrayers`);
  }
}

export async function updatePersonalPrayer(
  uid: string,
  id: string,
  patch: { title?: string; contactId?: string | null; status?: PersonalPrayerStatus },
): Promise<void> {
  try {
    const clean: Record<string, unknown> = {};
    if (patch.title !== undefined) clean.title = patch.title.trim();
    if (patch.contactId !== undefined) clean.contactId = patch.contactId;
    if (patch.status !== undefined) clean.status = patch.status;
    await updateDoc(ref(uid, id), clean);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}/personalPrayers/${id}`);
  }
}

export async function deletePersonalPrayer(uid: string, id: string): Promise<void> {
  try {
    await deleteDoc(ref(uid, id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `users/${uid}/personalPrayers/${id}`);
  }
}
