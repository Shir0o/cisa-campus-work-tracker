// Per-user To ask notepad (#1649) — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/lib/toAsk.ts. The notepad is private to its
// Full-timer: readable and writable only by its owner, and only by a Full-timer
// (see the `toAskNotes` rule in firestore.rules).
import { arrayUnion, deleteField, doc, FieldPath, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { toAskNoteId, type AskNoteLine, type ToAskNotepad, type ToAskUpdate } from "../toAsk";

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

/** Dismiss a drafted line (ISO), or bring it back (null). */
export async function setToAskDismissedAt(
  db: Firestore,
  uid: string,
  key: string,
  at: string | null,
): Promise<void> {
  await setDoc(
    doc(db, "toAskNotes", uid),
    { overrides: { [key]: { dismissedAt: at ?? deleteField() } } },
    { mergeFields: [new FieldPath("overrides", key, "dismissedAt")] },
  );
}

/** Append one update to a drafted line, and tick it Asked in the same write
 *  when `askedAt` is given. */
export async function addToAskUpdate(
  db: Firestore,
  uid: string,
  key: string,
  update: ToAskUpdate,
  opts: { askedAt?: string | null } = {},
): Promise<void> {
  const override: Record<string, unknown> = { updates: arrayUnion(update) };
  const fields = [new FieldPath("overrides", key, "updates")];
  if (opts.askedAt) {
    override.askedAt = opts.askedAt;
    fields.push(new FieldPath("overrides", key, "askedAt"));
  }
  await setDoc(doc(db, "toAskNotes", uid), { overrides: { [key]: override } }, { mergeFields: fields });
}

// ── Line actions, either kind ────────────────────────────────────────────────
// A drafted line's state lives under `overrides`, written by field path above;
// a hand-written line lives in the `lines` array, rewritten whole the way the
// page already edits lines. These pick the right one from the line's key, so
// both surfaces share it. `notepad` is the one the caller is rendering.

function editLine(
  notepad: ToAskNotepad,
  noteId: string,
  edit: (line: AskNoteLine) => AskNoteLine,
): AskNoteLine[] {
  return (notepad.lines ?? []).map((l) => (l.id === noteId ? edit(l) : l));
}

/** Dismiss any line (ISO), or bring it back (null). */
export async function dismissToAskLine(
  db: Firestore,
  uid: string,
  notepad: ToAskNotepad,
  key: string,
  at: string | null,
): Promise<void> {
  const noteId = toAskNoteId(key);
  if (noteId == null) return setToAskDismissedAt(db, uid, key, at);
  const lines = editLine(notepad, noteId, (l) => {
    const next: AskNoteLine = { ...l, dismissedAt: at };
    // Firestore stores no undefined, and a brought-back line carries no stamp.
    if (!at) delete next.dismissedAt;
    return next;
  });
  await saveToAskNotepad(db, uid, { lines });
}

/** Keep an update on any line, ticking it Asked too when `askedAt` is given.
 *  This is the notepad half only: for `dest` `"contact"` or `"thread"` the
 *  caller also logs the Interaction or posts the Thread reply. */
export async function postToAskLineUpdate(
  db: Firestore,
  uid: string,
  notepad: ToAskNotepad,
  key: string,
  update: ToAskUpdate,
  opts: { askedAt?: string | null } = {},
): Promise<void> {
  const noteId = toAskNoteId(key);
  if (noteId == null) return addToAskUpdate(db, uid, key, update, opts);
  const lines = editLine(notepad, noteId, (l) => ({
    ...l,
    updates: [...(l.updates ?? []), update],
    ...(opts.askedAt ? { askedAt: opts.askedAt } : {}),
  }));
  await saveToAskNotepad(db, uid, { lines });
}
