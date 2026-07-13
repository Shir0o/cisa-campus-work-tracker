// Task writes — mirrors the web app's src/lib/todos.ts. The pure due-date
// helpers (DUE_PRESETS, duePresetToISO, presetForDue, dueChip) live in
// @cisa/core and are re-exported here so screens only import from one place.
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export {
  DUE_PRESETS,
  duePresetToISO,
  presetForDue,
  dueChip,
  type DuePresetKey,
  type DueTone,
} from '@cisa/core';

export interface NewTodo {
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  source?: { docId: string; docTitle: string } | null;
  contactId?: string | null;
  contactName?: string | null;
}

export async function addTodo(input: NewTodo, me: { uid: string; name: string }): Promise<void> {
  try {
    await addDoc(collection(db, 'tasks'), {
      title: input.title.trim(),
      dueDate: input.dueDate ?? null,
      priority: 'medium',
      status: 'pending',
      assigneeId: input.assigneeId ?? null,
      contactId: input.contactId ?? null,
      contactName: input.contactName ?? null,
      sourceInteractionId: null,
      createdById: me.uid || null,
      createdByName: me.name || null,
      sourceDocId: input.source?.docId ?? null,
      sourceDocTitle: input.source?.docTitle ?? null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'tasks');
  }
}

export async function updateTodo(
  id: string,
  patch: { title?: string; assigneeId?: string | null; dueDate?: string | null },
): Promise<void> {
  try {
    const clean: Record<string, unknown> = {};
    if (patch.title !== undefined) clean.title = patch.title.trim();
    if (patch.assigneeId !== undefined) clean.assigneeId = patch.assigneeId;
    if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate;
    await updateDoc(doc(db, 'tasks', id), clean);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, 'tasks');
  }
}

export async function setTodoDone(id: string, done: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'tasks', id), { status: done ? 'completed' : 'pending' });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, 'tasks');
  }
}

export async function deleteTodo(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'tasks', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'tasks');
  }
}
