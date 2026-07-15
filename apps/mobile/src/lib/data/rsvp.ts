// Event RSVP reads/writes — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { Rsvp } from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export function subscribeEventRsvps(
  eventId: string,
  cb: (rsvps: Rsvp[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeEventRsvps(db, eventId, cb, onError);
}

export function subscribeMyRsvps(
  uid: string,
  cb: (eventIds: Set<string>) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeMyRsvps(db, uid, cb, onError);
}

export async function setRsvp(
  eventId: string,
  user: { uid: string; name: string },
  going: boolean,
): Promise<void> {
  try {
    await core.setRsvp(db, eventId, user, going);
  } catch (e) {
    handleFirestoreError(e, going ? OperationType.CREATE : OperationType.DELETE, `events/${eventId}/rsvps/${user.uid}`);
  }
}
