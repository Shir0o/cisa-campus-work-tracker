// THE DAY'S GOAL (#544) reads/writes — shared Firestore logic behind an
// injected `db`. Mirrors the season-settings pattern (settings/{docId}
// singleton): one team-wide doc holds the whole goal, so any full-timer can
// move the number and every trainee reads the same one. Lives at settings/goal.
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { normalizeDayGoal, type DayGoal } from "../goal";

/** Live subscription to the team-wide day goal (settings/goal). */
export function subscribeDayGoal(
  db: Firestore,
  cb: (goal: DayGoal) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "settings", "goal"),
    (snap) => cb(normalizeDayGoal(snap.data())),
    (e) => (onError ? onError(e) : console.error("day goal subscription error", e)),
  );
}

/** Merge-write the day goal (create-or-update). */
export async function saveDayGoal(db: Firestore, patch: Partial<DayGoal>): Promise<void> {
  await setDoc(doc(db, "settings", "goal"), patch, { merge: true });
}