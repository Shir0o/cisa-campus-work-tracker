// Gospel partners reads/writes — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { PartnersByTerm } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export function subscribePartners(
  cb: (byTerm: PartnersByTerm) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribePartners(db, cb, onError);
}

export async function savePartners(byTerm: PartnersByTerm): Promise<void> {
  try {
    await core.savePartners(db, byTerm);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'settings/partners');
  }
}