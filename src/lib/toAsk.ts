import { arrayUnion, doc, onSnapshot, setDoc } from "firebase/firestore";
import * as core from "../../packages/core/src/data/toAsk";
import { db, handleFirestoreError, OperationType } from "./firebase";
import type { AskNoteLine, ToAskNotepad } from "../../packages/core/src/toAsk";

// Per-user To ask notepad (#1649), stored at toAskNotes/{uid}. A Full-timer's
// private prep — never shared with a Trainee or another Full-timer.
//
// The derivation itself is the shared @cisa/core module, re-exported whole so
// web and mobile render exactly what it returns (the page and the My Day
// pointer card read the same count by construction). Only the storage is
// mirrored here, because this app initialises its own Firebase `db`.
export * from "../../packages/core/src/toAsk";

export function subscribeToAskNotepad(
  uid: string,
  cb: (notepad: ToAskNotepad) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "toAskNotes", uid),
    (snap) => cb((snap.data() as ToAskNotepad) ?? {}),
    (e) => (onError ? onError(e) : console.error("toAskNotes subscription error", e)),
  );
}

export async function saveToAskNotepad(
  uid: string,
  patch: Partial<ToAskNotepad>,
): Promise<void> {
  try {
    await setDoc(doc(db, "toAskNotes", uid), patch, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `toAskNotes/${uid}`);
  }
}

/** Append one hand-written line without needing the whole notepad in hand —
 *  the contact overflow's "Add to To ask" runs with no subscription. */
export async function appendToAskLine(uid: string, line: AskNoteLine): Promise<void> {
  try {
    await setDoc(doc(db, "toAskNotes", uid), { lines: arrayUnion(line) }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `toAskNotes/${uid}`);
  }
}

// Targeted writes — a merge write cannot remove a nested key, so Undo Asked
// and the drafted write-back go through these (see packages/core/src/data/toAsk.ts).
async function guarded(uid: string, write: () => unknown) {
  try {
    await write();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `toAskNotes/${uid}`);
  }
}

export const setToAskAskedAt = (uid: string, key: string, at: string | null) =>
  guarded(uid, () => core.setToAskAskedAt(db, uid, key, at));

export const setToAskRewording = (uid: string, key: string, text: string) =>
  guarded(uid, () => core.setToAskRewording(db, uid, key, text));

export const deleteToAskOverride = (uid: string, key: string) =>
  guarded(uid, () => core.deleteToAskOverride(db, uid, key));

export const replaceToAskDrafted = (uid: string, drafted: Record<string, { at: string }>) =>
  guarded(uid, () => core.replaceToAskDrafted(db, uid, drafted));
