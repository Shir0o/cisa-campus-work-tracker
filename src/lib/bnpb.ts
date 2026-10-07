// BNPB Interaction suggestions (#1420, ADR 0037).
//
// BNPB pushes its Interactions through the server intake; each lands as one
// pending suggestion per named person, privately under the owner's user
// document. This module is the queue's deep module: it maps BNPB media to the
// tracker's interaction types, renders the duration, orders the queue, and
// settles a suggestion in one atomic batch. Matching, dismissing and "Not a
// CISA person" are deliberately not here yet (later tickets in the family).
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { canSeeContact, type AppRole } from './permissions';
import type { Contact } from '../types';

export const INTERACTION_SUGGESTIONS_SUBCOLLECTION = 'interactionSuggestions';
export const SUGGESTION_LINKS_SUBCOLLECTION = 'suggestionLinks';

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
  let hash = 0;
  for (let i = 0; i < bnpbContactId.length; i += 1) {
    hash = (hash * 31 + bnpbContactId.charCodeAt(i)) | 0;
  }
  return `b${(hash >>> 0).toString(36)}`;
}
