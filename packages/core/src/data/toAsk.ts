// Per-user To ask notepad (#1649) — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/lib/toAsk.ts. The notepad is private to its
// Full-timer: readable and writable only by its owner, and only by a Full-timer
// (see the `toAskNotes` rule in firestore.rules).
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import type { ToAskNotepad } from "../toAsk";

export function subscribeToAskNotepad(
  db: Firestore,
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
  db: Firestore,
  uid: string,
  patch: Partial<ToAskNotepad>,
): Promise<void> {
  await setDoc(doc(db, "toAskNotes", uid), patch, { merge: true });
}
