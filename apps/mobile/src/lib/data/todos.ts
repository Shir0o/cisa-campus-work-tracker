// Task writes — thin mobile wrapper. The actual Firestore logic is shared
// with the web app in @cisa/core (behind an injected `db`); this file just
// supplies the mobile `db` + this app's error handling.
import * as core from '@cisa/core';
import { db, handleFirestoreError, OperationType, sendNotification } from '../firebase';

export {
  DUE_PRESETS,
  duePresetToISO,
  presetForDue,
  dueChip,
  type DuePresetKey,
  type DueTone,
  type NewTodo,
} from '@cisa/core';

export async function addTodo(
  input: core.NewTodo,
  me: { uid: string; name: string },
): Promise<string | undefined> {
  try {
    return await core.addTodo(db, input, me, (payload) => void sendNotification(payload));
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'tasks');
  }
}

export async function updateTodo(
  id: string,
  patch: { title?: string; assigneeId?: string | null; dueDate?: string | null },
  context?: { oldAssigneeId?: string | null; title?: string; meName?: string; meUid?: string },
): Promise<void> {
  try {
    await core.updateTodo(
      db,
      id,
      patch,
      context,
      (payload) => void sendNotification(payload),
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, 'tasks');
  }
}

export async function setTodoDone(
  id: string,
  done: boolean,
  context?: { createdById?: string | null; title?: string; completerName?: string; completerUid?: string },
): Promise<void> {
  try {
    await core.setTodoDone(
      db,
      id,
      done,
      context,
      (payload) => void sendNotification(payload),
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, 'tasks');
  }
}

export async function deleteTodo(id: string): Promise<void> {
  try {
    await core.deleteTodo(db, id);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'tasks');
  }
}

