// Walking-together pairs — shared Firestore logic behind an injected `db`.
// Mirrors the web app's src/lib/walkingPairs.ts.
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import type { WalkingPairs } from "../types";

export type WalkingPairsMap = Record<string, string[]>;

/** Live subscription to the team-wide walking-together pairs. */
export function subscribeWalkingPairs(
  db: Firestore,
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
export async function saveWalkingPairs(
  db: Firestore,
  pairs: WalkingPairsMap,
): Promise<void> {
  await setDoc(doc(db, "settings", "walking"), { pairs }, { merge: true });
}
