// Shared (contact) prayer status writes — shared Firestore logic behind an
// injected `db`. Mirrors the web app's src/lib/prayers.ts.
import { doc, updateDoc, type Firestore } from "firebase/firestore";
import type { PrayerRecord } from "../types";

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
