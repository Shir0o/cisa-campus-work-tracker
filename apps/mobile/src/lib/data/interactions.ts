// Per-contact interaction log ("Conversations" tab) — thin mobile wrapper
// around the shared @cisa/core logic (behind an injected `db`), composing
// logActivity so new/edited interactions surface in the contact's own
// History tab.
import * as core from '@cisa/core';
import type { Interaction } from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType } from '../firebase';

export function subscribeInteractions(
  contactId: string,
  cb: (interactions: Interaction[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeInteractions(db, contactId, cb, onError);
}

export async function addInteraction(
  contactId: string,
  contactName: string,
  input: { content: string; dateTime: string; type: string },
  by: { uid: string; name: string; photoURL?: string | null },
): Promise<void> {
  try {
    await core.addInteraction(db, contactId, input, by);
    void logActivity({
      action: 'logged an interaction for',
      targetId: contactId,
      targetName: contactName,
      targetType: 'contact',
      type: core.interactionActivityType(input.type),
      description: input.content.trim(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/interactions`);
  }
}

export async function updateInteraction(
  contactId: string,
  contactName: string,
  interactionId: string,
  patch: { content: string; dateTime: string; type: string },
): Promise<void> {
  try {
    await core.updateInteraction(db, contactId, interactionId, patch);
    void logActivity({
      action: 'updated an interaction for',
      targetId: contactId,
      targetName: contactName,
      targetType: 'contact',
      type: 'edit',
      description: patch.content.trim(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `contacts/${contactId}/interactions/${interactionId}`);
  }
}

export async function deleteInteraction(contactId: string, contactName: string, interaction: Interaction): Promise<void> {
  try {
    await core.deleteInteraction(db, contactId, interaction.id);
    void logActivity({
      action: 'deleted an interaction for',
      targetId: contactId,
      targetName: contactName,
      targetType: 'contact',
      type: 'edit',
      description: interaction.content.trim(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `contacts/${contactId}/interactions/${interaction.id}`);
  }
}
