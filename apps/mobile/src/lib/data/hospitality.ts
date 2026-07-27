// Hospitality offers — a Community member's standing offer to host students.
// Thin mobile wrapper around the shared @cisa/core logic.
import * as core from '@cisa/core';
import type { HospitalityOffer } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export type { HospitalityOffer } from '@cisa/core';

export function subscribeMyHospitalityOffer(
  uid: string,
  cb: (offer: HospitalityOffer | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeMyHospitalityOffer(db, uid, cb, onError);
}

export function subscribeHospitalityOffers(
  cb: (offers: HospitalityOffer[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeHospitalityOffers(db, cb, onError);
}

export async function saveHospitalityOffer(
  uid: string,
  input: { name: string; availability: string[]; seats: string; note: string },
): Promise<void> {
  try {
    await core.saveHospitalityOffer(db, uid, input);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `hospitalityOffers/${uid}`);
  }
}

export async function deleteHospitalityOffer(uid: string): Promise<void> {
  try {
    await core.deleteHospitalityOffer(db, uid);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `hospitalityOffers/${uid}`);
  }
}
