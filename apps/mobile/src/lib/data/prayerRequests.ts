// Prayer requests — a member asking the team to pray. Thin mobile wrapper
// around the shared @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { PrayerRequest } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export type { PrayerRequest } from '@cisa/core';

export function subscribeMyPrayerRequests(
  uid: string,
  cb: (requests: PrayerRequest[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeMyPrayerRequests(db, uid, cb, onError);
}

export function subscribeOpenPrayerRequests(
  cb: (requests: PrayerRequest[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeOpenPrayerRequests(db, cb, onError);
}

export async function addPrayerRequest(input: {
  uid: string;
  name: string;
  body: string;
}): Promise<void> {
  try {
    await core.addPrayerRequest(db, input);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'prayerRequests');
  }
}

export async function setPrayerRequestStatus(
  id: string,
  status: PrayerRequest['status'],
): Promise<void> {
  try {
    await core.setPrayerRequestStatus(db, id, status);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `prayerRequests/${id}`);
  }
}
