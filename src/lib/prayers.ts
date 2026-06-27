import { doc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { PrayerRecord } from "../types";

// Update a shared prayer's status from My Day. Mirrors the bookkeeping stamp the
// Prayer page writes (PrayerList.tsx) so both surfaces stay consistent. The
// merged document keeps its required `contactId`, and the statuses used here are
// all in the Firestore rules' allowed set.
export async function updatePrayerStatus(
  prayerId: string,
  status: PrayerRecord["status"],
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  try {
    await updateDoc(doc(db, "prayers", prayerId), {
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: by.uid || null,
      updatedByName: by.name || null,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `prayers/${prayerId}`);
  }
}
