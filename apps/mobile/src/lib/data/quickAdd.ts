// Quick add's save on the phone: the shared one-batch write in @cisa/core,
// supplied with this app's db and error reporting.
import * as core from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export async function saveQuickAdd(
  input: core.QuickAddSaveInput,
  by: { uid?: string | null; name?: string | null },
): Promise<{ contactId: string; createdContact: boolean }> {
  try {
    return await core.saveQuickAdd(db, input, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'quick-add');
    throw e;
  }
}
