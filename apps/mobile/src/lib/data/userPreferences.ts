// Per-user My Day preferences — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export type { UserPreferences } from '@cisa/core';

export function subscribeUserPreferences(
  uid: string,
  cb: (prefs: core.UserPreferences) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeUserPreferences(db, uid, cb, onError);
}

export async function saveUserPreferences(
  uid: string,
  patch: Partial<core.UserPreferences>,
): Promise<void> {
  try {
    await core.saveUserPreferences(db, uid, patch);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `userPreferences/${uid}`);
  }
}
