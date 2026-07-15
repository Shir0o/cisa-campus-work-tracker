// Full-timer roster read, plus the full team-roster (users + invitations)
// reads/writes for Settings — thin mobile wrappers around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { AppRole, AppUser, FullTimerSummary, Invitation } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export function subscribeFullTimers(
  cb: (fullTimers: FullTimerSummary[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeFullTimers(db, cb, onError);
}

export function subscribeUsers(
  cb: (users: AppUser[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeUsers(db, cb, onError);
}

export function subscribeInvitations(
  cb: (invitations: Invitation[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeInvitations(db, cb, onError);
}

export async function toggleUserApproval(uid: string, currentStatus: boolean): Promise<void> {
  try {
    await core.toggleUserApproval(db, uid, currentStatus);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function changeUserRole(uid: string, newRole: AppRole): Promise<void> {
  try {
    await core.changeUserRole(db, uid, newRole);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function sendInvitation(input: { email: string; role: AppRole; invitedBy: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  try {
    await core.sendInvitation(db, { ...input, email });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `invitations/${email}`);
  }
}

export async function revokeInvitation(email: string): Promise<void> {
  try {
    await core.revokeInvitation(db, email);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `invitations/${email.toLowerCase()}`);
  }
}
