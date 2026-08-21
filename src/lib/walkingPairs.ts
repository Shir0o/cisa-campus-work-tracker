import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import type { WalkingPairs } from "../types";

export type WalkingPairsMap = Record<string, string[]>;

/** Live subscription to the team-wide walking-together pairs. */
export function subscribeWalkingPairs(
  cb: (pairs: WalkingPairsMap) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "settings", "walking"),
    (snap) => cb(((snap.data() as WalkingPairs | undefined)?.pairs) ?? {}),
    (e) => (onError ? onError(e) : console.error("walking pairs subscription error", e)),
  );
}

/** Replace the full-timer → trainees map in settings/walking. */
export async function saveWalkingPairs(pairs: WalkingPairsMap): Promise<void> {
  try {
    await setDoc(doc(db, "settings", "walking"), { pairs }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "settings/walking");
  }
}
