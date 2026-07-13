// Personal (private, per-user) prayers — thin mobile wrapper around the
// shared @cisa/core logic (behind an injected `db`). Live under
// users/{uid}/personalPrayers; never shared.
import * as core from '@cisa/core';
import type { PersonalPrayer, PersonalPrayerStatus } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export type { PersonalPrayer, PersonalPrayerStatus } from '@cisa/core';

export function subscribePersonalPrayers(
  uid: string,
  cb: (prayers: PersonalPrayer[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribePersonalPrayers(db, uid, cb, onError);
}

export async function addPersonalPrayer(
  uid: string,
  input: { title: string; contactId?: string | null },
): Promise<void> {
  try {
    await core.addPersonalPrayer(db, uid, input);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `users/${uid}/personalPrayers`);
  }
}

export async function updatePersonalPrayer(
  uid: string,
  id: string,
  patch: {
    title?: string;
    contactId?: string | null;
    status?: PersonalPrayerStatus;
    answeredAt?: string | null;
    answeredBody?: string | null;
  },
): Promise<void> {
  try {
    await core.updatePersonalPrayer(db, uid, id, patch);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}/personalPrayers/${id}`);
  }
}

export async function deletePersonalPrayer(uid: string, id: string): Promise<void> {
  try {
    await core.deletePersonalPrayer(db, uid, id);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `users/${uid}/personalPrayers/${id}`);
  }
}
