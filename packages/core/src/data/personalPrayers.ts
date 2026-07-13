// Personal (private, per-user) prayers — shared Firestore logic behind an
// injected `db`. Live under users/{uid}/personalPrayers; never shared. Mirrors
// the web app's src/lib/personalPrayers.ts. The PersonalPrayer type lives in
// ../myday.ts (shared with splitPrayers).
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { PersonalPrayer, PersonalPrayerStatus } from "../myday";

const col = (db: Firestore, uid: string) => collection(db, "users", uid, "personalPrayers");
const ref = (db: Firestore, uid: string, id: string) =>
  doc(db, "users", uid, "personalPrayers", id);

export function subscribePersonalPrayers(
  db: Firestore,
  uid: string,
  cb: (prayers: PersonalPrayer[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(db, uid), orderBy("date", "asc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Partial<PersonalPrayer>;
          return {
            id: d.id,
            title: data.title ?? "",
            contactId: data.contactId ?? null,
            date: data.date ?? new Date().toISOString(),
            status: data.status ?? "open",
            answeredAt: data.answeredAt ?? null,
            answeredBody: data.answeredBody ?? null,
          };
        }),
      ),
    (e) => (onError ? onError(e) : console.error("personalPrayers subscription error", e)),
  );
}

export async function addPersonalPrayer(
  db: Firestore,
  uid: string,
  input: { title: string; contactId?: string | null },
): Promise<void> {
  await addDoc(col(db, uid), {
    title: input.title.trim(),
    contactId: input.contactId ?? null,
    date: new Date().toISOString(),
    status: "open" as PersonalPrayerStatus,
  });
}

export async function updatePersonalPrayer(
  db: Firestore,
  uid: string,
  id: string,
  patch: {
    title?: string;
    contactId?: string | null;
    status?: PersonalPrayerStatus;
    answeredAt?: string | null;
    answeredBody?: string | null;
  },
): Promise<void> {
  const clean: Record<string, any> = {};
  if (patch.title !== undefined) clean.title = patch.title.trim();
  if (patch.contactId !== undefined) clean.contactId = patch.contactId;
  if (patch.status !== undefined) clean.status = patch.status;
  if (patch.answeredAt !== undefined) clean.answeredAt = patch.answeredAt;
  if (patch.answeredBody !== undefined) clean.answeredBody = patch.answeredBody;
  await updateDoc(ref(db, uid, id), clean);
}

export async function deletePersonalPrayer(db: Firestore, uid: string, id: string): Promise<void> {
  await deleteDoc(ref(db, uid, id));
}
