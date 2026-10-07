// BNPB Interaction suggestions (#1420, ADR 0037).
//
// BNPB pushes its Interactions through the server intake; each lands as one
// pending suggestion per named person, privately under the owner's user
// document. This module is the queue's deep module: it maps BNPB media to the
// tracker's interaction types, renders the duration, orders the queue, settles
// or dismisses a suggestion, and records "Not a CISA person" choices. Matching
// is deliberately not here yet (a later ticket in the family).
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { canSeeContact, type AppRole } from './permissions';
import type { Contact, Interaction } from '../types';

export const INTERACTION_SUGGESTIONS_SUBCOLLECTION = 'interactionSuggestions';
export const SUGGESTION_LINKS_SUBCOLLECTION = 'suggestionLinks';
export const NOT_A_CISA_PERSON_SUBCOLLECTION = 'notACisaPeople';

export type InteractionSuggestionStatus = 'pending' | 'confirmed' | 'dismissed' | 'withdrawn';

export interface InteractionSuggestion {
  id: string;
  syncId: string;
  bnpbContactId: string;
  /** The name as written in BNPB. */
  bnpbName: string;
  occurredAt: string;
  durationMinutes: number | null;
  summary: string;
  medium: string;
  /** The text the owner can tidy before confirming; starts as `summary`. */
  text: string;
  status: InteractionSuggestionStatus;
  contactId?: string | null;
}

/**
 * BNPB's medium vocabulary mapped to the tracker's interaction types. Matched
 * case-insensitively and by containment so "Phone Call" and "coffee catch-up"
 * both land. Anything unrecognised is a plain interaction.
 */
export function mediumToType(medium: string): string {
  const value = (medium || '').toLowerCase();
  if (value.includes('call')) return 'call';
  if (value.includes('email')) return 'email';
  if (value.includes('text') || value.includes('message') || value.includes('chat')) return 'chat';
  if (
    value.includes('coffee') ||
    value.includes('meal') ||
    value.includes('meeting') ||
    value.includes('in person')
  ) {
    return 'meeting';
  }
  return 'interaction';
}

/** Renders BNPB's `durationMinutes` in the tracker's short duration format. */
export function formatDurationMinutes(minutes: number | null | undefined): string | undefined {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) {
    return undefined;
  }
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Pending suggestions only, newest first. */
export function orderPendingSuggestions(list: InteractionSuggestion[]): InteractionSuggestion[] {
  return list
    .filter((s) => s.status === 'pending')
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * The calendar day a timestamp belongs to, as `YYYY-MM-DD` (#1422). A logged
 * Interaction stores a bare date, while a BNPB `occurredAt` is a full
 * timestamp; both lead with the day the person means, so the prefix is the
 * comparison key and no timezone enters the answer.
 */
export function calendarDay(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

/**
 * The owner's own Interaction on the chosen Contact that shares `occurredAt`'s
 * calendar day, if any (#1422). Entries another teammate logged never count,
 * and when several of the owner's fall on the day the latest wins.
 */
export function findSameDayInteraction(
  interactions: Interaction[],
  uid: string,
  occurredAt: string,
): Interaction | null {
  const day = calendarDay(occurredAt);
  if (!day) return null;
  let found: Interaction | null = null;
  for (const interaction of interactions) {
    if (interaction.userId !== uid) continue;
    if (calendarDay(interaction.dateTime) !== day) continue;
    if (!found || interaction.dateTime > found.dateTime) found = interaction;
  }
  return found;
}

/** Live Interactions for one Contact, for the same-day duplicate flag (#1422). */
export function subscribeContactInteractions(
  contactId: string,
  cb: (interactions: Interaction[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(collection(db, 'contacts', contactId, 'interactions'), orderBy('dateTime', 'desc'));
  return onSnapshot(
    q,
    (snap) =>
      cb(
        snap.docs.map(
          (entry) => ({ id: entry.id, ...(entry.data() as Omit<Interaction, 'id'>) } as Interaction),
        ),
      ),
    (error) =>
      onError ? onError(error) : console.error('contact interactions subscription error', error),
  );
}

/** Whether `uid` may attach a suggestion to `contact` at their `role`. */
export function isContactVisible(
  role: AppRole | string | null,
  uid: string | null | undefined,
  contact: Contact | null | undefined,
): boolean {
  return canSeeContact(role, uid, contact);
}

export function subscribePendingSuggestions(
  uid: string,
  cb: (suggestions: InteractionSuggestion[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(
    collection(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION),
    orderBy('occurredAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((entry) => {
        const data = entry.data() as Partial<InteractionSuggestion>;
        return {
          id: entry.id,
          syncId: data.syncId ?? '',
          bnpbContactId: data.bnpbContactId ?? '',
          bnpbName: data.bnpbName ?? '',
          occurredAt: data.occurredAt ?? '',
          durationMinutes: data.durationMinutes ?? null,
          summary: data.summary ?? '',
          medium: data.medium ?? '',
          text: data.text ?? data.summary ?? '',
          status: data.status ?? 'pending',
          contactId: data.contactId ?? null,
        } as InteractionSuggestion;
      });
      cb(orderPendingSuggestions(list));
    },
    (error) => (onError ? onError(error) : console.error('interaction suggestions subscription error', error)),
  );
}

export interface ConfirmSuggestionInput {
  uid: string;
  user: { uid: string; displayName?: string | null; photoURL?: string | null; email?: string | null };
  role: AppRole | string | null;
  suggestion: InteractionSuggestion;
  contact: Contact;
  text: string;
}

/**
 * Settles one suggestion: in a single batch it writes the Interaction as the
 * owner on the chosen Contact, marks the suggestion confirmed, and remembers
 * the Suggestion link for that BNPB contact. Refuses if the Contact is not
 * visible, so the write is never half-done.
 */
export async function confirmSuggestion(input: ConfirmSuggestionInput): Promise<void> {
  const { uid, user, role, suggestion, contact, text } = input;
  if (!isContactVisible(role, uid, contact)) {
    throw new Error('That contact is not visible to you.');
  }

  const trimmed = text.trim();
  const duration = formatDurationMinutes(suggestion.durationMinutes);
  const loggerName = user.displayName || user.email?.split('@')[0] || '';
  const batch = writeBatch(db);

  const interactionRef = doc(collection(db, 'contacts', contact.id, 'interactions'));
  batch.set(interactionRef, {
    userId: uid,
    userName: loggerName,
    userPhoto: user.photoURL || '',
    content: trimmed,
    dateTime: suggestion.occurredAt,
    type: mediumToType(suggestion.medium),
    ...(duration ? { duration } : {}),
    createdAt: serverTimestamp(),
  });

  batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestion.id), {
    status: 'confirmed',
    contactId: contact.id,
    text: trimmed,
    confirmedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid, SUGGESTION_LINKS_SUBCOLLECTION, suggestionLinkId(suggestion.bnpbContactId)),
    {
      bnpbContactId: suggestion.bnpbContactId,
      contactId: contact.id,
      updatedAt: serverTimestamp(),
    },
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `contacts/${contact.id}/interactions`);
    throw error;
  }
}

/** Firestore-safe, deterministic link id for a BNPB contact. */
export function suggestionLinkId(bnpbContactId: string): string {
  return hashId(bnpbContactId);
}

/** Firestore-safe, deterministic choice id for a BNPB contact. */
export function notACisaPersonId(bnpbContactId: string): string {
  return hashId(bnpbContactId);
}

function hashId(bnpbContactId: string): string {
  let hash = 0;
  for (let i = 0; i < bnpbContactId.length; i += 1) {
    hash = (hash * 31 + bnpbContactId.charCodeAt(i)) | 0;
  }
  return `b${(hash >>> 0).toString(36)}`;
}

export interface DismissSuggestionInput {
  uid: string;
  suggestion: InteractionSuggestion;
}

/** Dismisses one suggestion for good; the only way back is the offered Undo. */
export async function dismissSuggestion(input: DismissSuggestionInput): Promise<void> {
  const { uid, suggestion } = input;
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestion.id), {
    status: 'dismissed',
    dismissedBy: 'single',
    dismissedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}`);
    throw error;
  }
}

export interface UndoSuggestionDismissInput {
  uid: string;
  suggestionId: string;
}

/** Reverses a single dismissal, restoring the suggestion to pending. */
export async function undoSuggestionDismiss(input: UndoSuggestionDismissInput): Promise<void> {
  const { uid, suggestionId } = input;
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestionId), {
    status: 'pending',
    dismissedBy: deleteField(),
    dismissedAt: deleteField(),
  });
  await batch.commit();
}

export interface MarkNotACisaPersonInput {
  uid: string;
  bnpbContactId: string;
  /** The owner's pending suggestions; every one for this BNPB contact is dismissed. */
  suggestions: InteractionSuggestion[];
}

/**
 * Records a "Not a CISA person" choice for a BNPB contact and dismisses every
 * pending suggestion naming them. Returns the dismissed suggestion ids so the
 * caller's Undo can restore exactly these, and not ones dismissed one at a time.
 */
export async function markNotACisaPerson(input: MarkNotACisaPersonInput): Promise<string[]> {
  const { uid, bnpbContactId, suggestions } = input;
  const affected = suggestions.filter(
    (s) => s.bnpbContactId === bnpbContactId && s.status === 'pending',
  );
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, NOT_A_CISA_PERSON_SUBCOLLECTION, notACisaPersonId(bnpbContactId)), {
    bnpbContactId,
    createdAt: serverTimestamp(),
  });
  for (const suggestion of affected) {
    batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestion.id), {
      status: 'dismissed',
      dismissedBy: 'notACisaPerson',
      dismissedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return affected.map((s) => s.id);
}

export interface UndoNotACisaPersonInput {
  uid: string;
  bnpbContactId: string;
  suggestionIds: string[];
}

/** Removes a "Not a CISA person" choice and restores only what it dismissed. */
export async function undoNotACisaPerson(input: UndoNotACisaPersonInput): Promise<void> {
  const { uid, bnpbContactId, suggestionIds } = input;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, NOT_A_CISA_PERSON_SUBCOLLECTION, notACisaPersonId(bnpbContactId)));
  for (const suggestionId of suggestionIds) {
    batch.update(doc(db, 'users', uid, INTERACTION_SUGGESTIONS_SUBCOLLECTION, suggestionId), {
      status: 'pending',
      dismissedBy: deleteField(),
      dismissedAt: deleteField(),
    });
  }
  await batch.commit();
}
