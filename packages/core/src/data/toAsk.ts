// Per-user To ask notepad (#1649) — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/lib/toAsk.ts. The notepad is private to its
// Full-timer: readable and writable only by its owner, and only by a Full-timer
// (see the `toAskNotes` rule in firestore.rules).
import { deleteField, doc, FieldPath, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
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

// ── Targeted writes ──────────────────────────────────────────────────────────
// `setDoc(…, { merge: true })` deep-merges nested maps, so it can add a key
// under `overrides` / `drafted` but never remove one. These write exactly one
// field path instead (`mergeFields`), which also creates the doc if it is not
// there yet. Signal keys contain `|`, so paths are built as FieldPaths, never
// dotted strings.

/** Tick a drafted line Asked (ISO), or untick it (null) keeping its rewording. */
export async function setToAskAskedAt(
  db: Firestore,
  uid: string,
  key: string,
  at: string | null,
): Promise<void> {
  await setDoc(
    doc(db, "toAskNotes", uid),
    { overrides: { [key]: { askedAt: at ?? deleteField() } } },
    { mergeFields: [new FieldPath("overrides", key, "askedAt")] },
  );
}

/** Set a drafted line's reworded text. */
export async function setToAskRewording(
  db: Firestore,
  uid: string,
  key: string,
  text: string,
): Promise<void> {
  await setDoc(
    doc(db, "toAskNotes", uid),
    { overrides: { [key]: { text } } },
    { mergeFields: [new FieldPath("overrides", key, "text")] },
  );
}

/** Remove a drafted line's override entirely. */
export async function deleteToAskOverride(db: Firestore, uid: string, key: string): Promise<void> {
  await setDoc(
    doc(db, "toAskNotes", uid),
    { overrides: { [key]: deleteField() } },
    { mergeFields: [new FieldPath("overrides", key)] },
  );
}

/** Replace the drafted map whole, so keys the derivation dropped go too. */
export async function replaceToAskDrafted(
  db: Firestore,
  uid: string,
  drafted: Record<string, { at: string }>,
): Promise<void> {
  await setDoc(doc(db, "toAskNotes", uid), { drafted }, { mergeFields: ["drafted"] });
}
