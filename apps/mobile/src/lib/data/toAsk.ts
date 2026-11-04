// The To ask notepad (#1649) — thin mobile wrapper around the shared @cisa/core
// storage (behind an injected `db`). A Full-timer's private prep, one document
// per person at toAskNotes/{uid}. These write the notepad only: a posted update
// that also goes to a contact's page or the Thread is written by the screen
// through the interactions and threads wrappers.
import * as core from '@cisa/core';
import type { ToAskNotepad, ToAskUpdate } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export function subscribeToAskNotepad(
  uid: string,
  cb: (notepad: ToAskNotepad) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeToAskNotepad(db, uid, cb, onError);
}

async function guarded(uid: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `toAskNotes/${uid}`);
  }
}

export const saveToAskNotepad = (uid: string, patch: Partial<ToAskNotepad>) =>
  guarded(uid, () => core.saveToAskNotepad(db, uid, patch));

/** Tick a drafted line Asked (ISO), or untick it (null) keeping its rewording. */
export const setToAskAskedAt = (uid: string, key: string, at: string | null) =>
  guarded(uid, () => core.setToAskAskedAt(db, uid, key, at));

export const setToAskRewording = (uid: string, key: string, text: string) =>
  guarded(uid, () => core.setToAskRewording(db, uid, key, text));

export const deleteToAskOverride = (uid: string, key: string) =>
  guarded(uid, () => core.deleteToAskOverride(db, uid, key));

export const replaceToAskDrafted = (uid: string, drafted: Record<string, { at: string }>) =>
  guarded(uid, () => core.replaceToAskDrafted(db, uid, drafted));

/** Dismiss any line (ISO), or bring it back (null). */
export const dismissToAskLine = (uid: string, notepad: ToAskNotepad, key: string, at: string | null) =>
  guarded(uid, () => core.dismissToAskLine(db, uid, notepad, key, at));

/** Keep an update on any line, ticking it Asked too when `askedAt` is given. */
export const postToAskLineUpdate = (
  uid: string,
  notepad: ToAskNotepad,
  key: string,
  update: ToAskUpdate,
  opts?: { askedAt?: string | null },
) => guarded(uid, () => core.postToAskLineUpdate(db, uid, notepad, key, update, opts));
