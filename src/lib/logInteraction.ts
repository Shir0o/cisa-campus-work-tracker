// Log an interaction for one person or several — the write behind the Log
// interaction popup. One entry lands on each person's own page, and each
// person's Last seen moves to the day it happened, all in one batch so a
// refused write leaves nobody half-logged.
//
// When it is more than one person (a Visit to a household, say) the entries
// share a `groupId`, so they read as the same moment rather than as several
// unrelated ones. One person has no group to name, so it carries none.
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { applyContactActivityToBatch } from './contactActivity';
import type { SystemActivity, Task } from '../types';

/** The History entry's kind for an interaction type: a meeting or a visit is
 *  an event, a chat is a comment, the rest read as themselves. */
export const activityTypeFor = (type: string): SystemActivity['type'] =>
  type === 'meeting' || type === 'visit' ? 'event' : type === 'chat' ? 'comment' : (type as SystemActivity['type']);

export interface LogInteractionInput {
  contactIds: string[];
  /** Names by contact id, written onto each entry. Missing ones read "Unknown". */
  contactNames?: Record<string, string>;
  type: string;
  /** The day it happened, `yyyy-MM-dd`. */
  dateTime: string;
  content: string;
  by: { uid?: string | null; name: string };
  /** Follow-ups: each non-empty one becomes a to-do per person. */
  tasks?: Partial<Task>[];
}

/** A fresh id to tie the entries of one moment together. Nothing is written. */
export const newInteractionGroupId = (): string => doc(collection(db, 'contacts')).id;

export async function logInteraction(input: LogInteractionInput): Promise<{ groupId: string | null }> {
  const { contactIds, contactNames = {}, type, dateTime, content, by, tasks = [] } = input;
  if (contactIds.length === 0) throw new Error('logInteraction needs at least one person');

  const groupId = contactIds.length > 1 ? newInteractionGroupId() : null;
  const batch = writeBatch(db);

  for (const contactId of contactIds) {
    const contactName = contactNames[contactId] || 'Unknown';
    const interactionRef = doc(collection(db, `contacts/${contactId}/interactions`));

    batch.set(interactionRef, {
      type,
      dateTime,
      content,
      createdAt: serverTimestamp(),
      userId: by.uid,
      userName: by.name,
      contactId,
      contactName,
      ...(groupId ? { groupId } : {}),
    });

    // Update the person's derived activity fields (#329).
    applyContactActivityToBatch(batch, doc(db, 'contacts', contactId), {
      date: dateTime,
      by: { uid: by.uid || null, name: by.name },
      type: 'interaction',
    });

    for (const task of tasks) {
      if (!task.title?.trim()) continue;
      batch.set(doc(collection(db, 'tasks')), {
        title: task.title,
        dueDate: task.dueDate || dateTime,
        priority: task.priority || 'medium',
        contactId,
        contactName,
        assigneeId: by.uid || null,
        status: 'pending',
        sourceInteractionId: interactionRef.id,
        createdAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
  return { groupId };
}
