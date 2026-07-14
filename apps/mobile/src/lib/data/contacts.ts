// Contacts/stages/touches reads + contact creation — thin mobile wrapper
// around the shared @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { Contact, ContactNotifyPayload, NewContactInput, Stage, Touch } from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType, sendNotification } from '../firebase';

export function subscribeContacts(
  cb: (contacts: Contact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeContacts(db, cb, onError);
}

export function subscribeStages(
  cb: (stages: Stage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeStages(db, cb, onError);
}

export function subscribeTouches(
  cb: (touches: Touch[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeTouches(db, cb, onError);
}

/** Create a new contact; self-notifies the creator and pings their full-timer
 * when the creator is a trainee, then logs the activity (surfaced in History). */
export async function addContact(
  input: NewContactInput,
  by: { uid?: string | null; name?: string | null },
): Promise<string> {
  try {
    const id = await core.addContact(db, input, by, (payload: ContactNotifyPayload) => void sendNotification(payload));

    const fieldsLog = [
      `Group: ${input.role}`,
      `Stage: ${input.stage}`,
      `Location/Residence: ${input.location}`,
      input.email ? `Email: ${input.email}` : '',
      input.phone ? `Phone: ${input.phone}` : '',
      input.spiritualBackground ? `Spiritual Background: ${input.spiritualBackground}` : '',
      input.tags.length > 0 ? `Tags: ${input.tags.join(', ')}` : '',
      input.notes ? `Notes: ${input.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    void logActivity({
      action: 'created a new contact',
      targetId: id,
      targetName: input.name,
      targetType: 'contact',
      type: 'create',
      description: fieldsLog,
    });

    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'contacts');
    throw e;
  }
}
