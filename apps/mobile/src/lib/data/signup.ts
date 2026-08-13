// Public welcome-form (SignUp) write — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`). No authenticated actor: this is
// an anonymous public submission, unlike addContact's staff-quick-add flow.
import * as core from '@cisa/core';
import type { SignUpFormState } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export async function submitSignUp(
  form: SignUpFormState,
  seasonTags: string[],
  by?: { uid?: string | null; name?: string | null },
): Promise<string> {
  try {
    return await core.submitSignUp(db, form, seasonTags, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'contacts');
    throw e;
  }
}

