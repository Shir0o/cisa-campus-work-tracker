import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { PrayerRecord } from "../types";

// Start carrying something for a contact. Mirrors PrayerList.tsx's
// `handleAddBurden` write, minus the activity entry — callers that already log
// their own action (a visit, say) shouldn't produce two entries for one thing.
// Returns the new prayer's id so the caller can link back to it.
export async function addPrayerBurden(
  contactId: string,
  burden: string,
  by: { uid?: string | null; name?: string | null },
): Promise<string | null> {
  const text = burden.trim();
  if (!contactId || !text) return null;
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, "prayers"), {
      contactId,
      date: now,
      burden: text,
      status: "pending",
      prayerPage: true,
      updatedAt: now,
      updatedBy: by.uid || null,
      updatedByName: by.name || null,
    });
    return ref?.id ?? null;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "prayers");
    return null;
  }
}

// Update a shared prayer's status from My Day. Mirrors the bookkeeping stamp the
// Prayer page writes (PrayerList.tsx) so both surfaces stay consistent. The
// merged document keeps its required `contactId`, and the statuses used here are
// all in the Firestore rules' allowed set.
export async function updatePrayerStatus(
  prayerId: string,
  status: PrayerRecord["status"],
  by: { uid?: string | null; name?: string | null },
  answer?: string | null,
  answeredAt?: string | null,
): Promise<void> {
  try {
    const clean: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: by.uid || null,
      updatedByName: by.name || null,
    };
    if (answer !== undefined) clean.answer = answer;
    if (answeredAt !== undefined) clean.answeredAt = answeredAt;
    await updateDoc(doc(db, "prayers", prayerId), clean);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `prayers/${prayerId}`);
  }
}

/**
 * Whether a burden belongs on the team prayer page ("On our hearts"). Mirrors
 * `isTeamPrayer` in packages/core/src/prayerThread.ts — keep the two in step.
 *
 * An ABSENT flag means team: every prayer written before the phone's "Bring it
 * to team prayer" toggle existed stays exactly where it was, so this page needs
 * no backfill. That is why this is a function and not `p.teamPrayer` at the
 * call site.
 */
export function isTeamPrayer(p: Pick<PrayerRecord, "teamPrayer">): boolean {
  return p.teamPrayer !== false;
}
