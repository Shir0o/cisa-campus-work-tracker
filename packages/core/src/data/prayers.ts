// Shared (contact) prayer status writes — shared Firestore logic behind an
// injected `db`. Mirrors the web app's src/lib/prayers.ts.
import { addDoc, collection, doc, onSnapshot, query, updateDoc, type Firestore } from "firebase/firestore";
import type { PrayerRecord } from "../types";

/** Live subscription to every team prayer, normalizing legacy docs (mirrors
 * the web app's src/views/PrayerList.tsx mapping). */
export function subscribeAllPrayers(
  db: Firestore,
  cb: (prayers: PrayerRecord[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "prayers")),
    (snap) => {
      const list: PrayerRecord[] = [];
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, any>;
        if (data.date && data.burden) {
          list.push({ id: d.id, ...data } as PrayerRecord);
        } else if (data.prayedFor) {
          list.push({
            id: d.id,
            contactId: data.contactId,
            date: data.updatedAt || new Date().toISOString(),
            burden: data.prayedFor,
            status: data.unanswered ? "unanswered" : "pending",
            updatedAt: data.updatedAt || new Date().toISOString(),
            updatedBy: data.updatedBy,
            updatedByName: data.updatedByName,
          } as PrayerRecord);
        }
      });
      cb(list);
    },
    (e) => (onError ? onError(e) : console.error("prayers subscription error", e)),
  );
}

/** Create a new burden for a contact (from the Prayer page's "hold someone" flow). */
export async function addPrayer(
  db: Firestore,
  input: { contactId: string; burden: string },
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, "prayers"), {
    contactId: input.contactId,
    date: now,
    burden: input.burden.trim(),
    status: "pending",
    prayerPage: true,
    updatedAt: now,
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  });
}

/** Edit an existing prayer's burden text. */
export async function updatePrayerBurden(
  db: Firestore,
  prayerId: string,
  burden: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  await updateDoc(doc(db, "prayers", prayerId), {
    burden: burden.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  });
}

export async function updatePrayerStatus(
  db: Firestore,
  prayerId: string,
  status: PrayerRecord["status"],
  by: { uid?: string | null; name?: string | null },
  answer?: string | null,
  answeredAt?: string | null,
): Promise<void> {
  const clean: Record<string, any> = {
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid || null,
    updatedByName: by.name || null,
  };
  if (answer !== undefined) clean.answer = answer;
  if (answeredAt !== undefined) clean.answeredAt = answeredAt;
  await updateDoc(doc(db, "prayers", prayerId), clean);
}
