// Contacts/stages/touches reads + contact creation — thin mobile wrapper
// around the shared @cisa/core logic (behind an injected `db`).
import { collection, getDocs } from 'firebase/firestore';
import * as core from '@cisa/core';
import type { Contact, ContactEditFields, ContactNotifyPayload, NewContactInput, Stage, Touch } from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType, sendNotification } from '../firebase';

export function subscribeContacts(
  cb: (contacts: Contact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeContacts(db, cb, onError);
}

/** Live subscription to a single contact (Contact Detail screen). */
export function subscribeContact(
  contactId: string,
  cb: (contact: Contact | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeContact(db, contactId, cb, onError);
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
      input.email ? `Email: ${input.email}` : '',
      input.phone ? `Phone: ${input.phone}` : '',
      input.spiritualBackground ? `Spiritual Background: ${input.spiritualBackground}` : '',
      input.tags.length > 0 ? `Tags: ${input.tags.join(', ')}` : '',
      input.notes ? `Notes: ${input.notes}` : '',
    ]
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

/** Move a contact to a new pipeline stage (The Journey); logs the activity
 * only for stage-to-stage moves (not moves out of "no stage"), matching web's
 * handleUpdateContactStage. */
export async function moveContactStage(
  contact: Contact,
  newStageLabel: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const oldStage = contact.stage;
  try {
    await core.moveContactStage(db, contact.id, newStageLabel, by);
    if (oldStage && oldStage !== newStageLabel) {
      void logActivity({
        action: `moved contact to stage "${newStageLabel}"`,
        targetId: contact.id,
        targetName: contact.name,
        targetType: 'contact',
        type: 'edit',
        description: `Changed stage from ${oldStage} to ${newStageLabel}`,
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contact.id}`);
  }
}

/** Save Contact Detail's edit form; logs a diff-based description (mirrors
 * the web modal's handleUpdate). */
export async function updateContact(
  contact: Contact,
  edits: ContactEditFields,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  try {
    const fullName = `${edits.firstName} ${edits.lastName}`.trim();
    const changes = core.diffContactFields(contact, edits);
    await core.updateContact(
      db,
      contact.id,
      {
        name: fullName,
        initials: (edits.firstName.charAt(0) + (edits.lastName.charAt(0) || '')).toUpperCase(),
        role: edits.role,
        email: edits.email,
        phone: edits.phone,
        stage: edits.stage,
        tags: edits.tags,
        notes: edits.notes,
        spiritualBackground: edits.spiritualBackground,
      },
      by,
    );
    void logActivity({
      action: changes.length > 0 ? `updated ${changes.join(', ')} for` : 'updated contact details for',
      targetId: contact.id,
      targetName: fullName,
      targetType: 'contact',
      type: 'edit',
      description: changes.join('\n'),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contact.id}`);
  }
}

/** Add/remove a tag from Contact Detail's Overview tab. */
export async function updateContactTags(
  contact: Contact,
  updatedTags: string[],
  verb: 'added' | 'removed',
  tag: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  const prevTags = contact.tags ?? [];
  try {
    await core.updateContactTags(db, contact.id, updatedTags, by);
    void logActivity({
      action: `${verb} tag #${tag} ${verb === 'removed' ? 'from' : 'to'}`,
      targetId: contact.id,
      targetName: contact.name,
      targetType: 'contact',
      type: 'edit',
      description: `Tags: [${prevTags.join(', ')}] → [${updatedTags.join(', ')}]`,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contact.id}`);
  }
}

/** Delete a contact, first capturing its subcollection counts for the audit
 * log (mirrors the web modal's handleDelete). */
export async function deleteContact(contact: Contact): Promise<void> {
  try {
    const [interactionsSnap, commentsSnap] = await Promise.all([
      getDocs(collection(db, 'contacts', contact.id, 'interactions')),
      getDocs(collection(db, 'contacts', contact.id, 'comments')),
    ]);
    const fieldsLog = core.contactDeleteFieldsLog(contact, interactionsSnap.size, commentsSnap.size);
    await core.deleteContact(db, contact.id);
    void logActivity({
      action: 'deleted contact',
      targetId: contact.id,
      targetName: contact.name,
      targetType: 'contact',
      type: 'alert',
      description: fieldsLog,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `contacts/${contact.id}`);
  }
}
