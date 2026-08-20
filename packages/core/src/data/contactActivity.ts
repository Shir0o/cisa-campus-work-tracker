import { doc, updateDoc, type Firestore } from 'firebase/firestore';

export interface ContactActivityAuthor {
  uid?: string | null;
  name?: string | null;
}

export interface ContactActivityStamp {
  date: string;
  by?: ContactActivityAuthor;
  type?: 'interaction' | 'visit' | 'attendance';
}

export interface ContactActivityPatch {
  lastSeen: string;
  lastContactedDate: string;
  lastContactedBy: string;
  lastContactedById: string | null;
  hasNewActivity: boolean;
  updatedAt: string;
  updatedBy: string | null;
  updatedByName: string;
  [key: string]: unknown;
}

/**
 * Builds the derived activity fields for a contact when an interaction,
 * visit, or attendance mark occurs (#329).
 */
export function buildContactActivityPatch(stamp: ContactActivityStamp): ContactActivityPatch {
  const authorName = stamp.by?.name?.trim() || 'Someone';
  const authorUid = stamp.by?.uid || null;
  const isoNow = new Date().toISOString();

  return {
    lastSeen: stamp.date,
    lastContactedDate: stamp.date,
    lastContactedBy: authorName,
    lastContactedById: authorUid,
    hasNewActivity: true,
    updatedAt: isoNow,
    updatedBy: authorUid,
    updatedByName: authorName,
  };
}

/**
 * Determines whether an attendance status change represents a presence
 * event that should update the person's lastSeen and activity fields.
 */
export function shouldTouchActivityForAttendance(status: boolean | 'late' | 'absent' | undefined): boolean {
  return status === true || status === 'late';
}

/**
 * Updates a contact's activity fields directly via Firestore `updateDoc`.
 */
export async function touchContactActivity(
  db: Firestore,
  contactId: string,
  stamp: ContactActivityStamp,
  injected?: {
    updateDocFn?: typeof updateDoc;
    docFn?: typeof doc;
  },
): Promise<void> {
  const patch = buildContactActivityPatch(stamp);
  const docFn = injected?.docFn ?? doc;
  const updateDocFn = injected?.updateDocFn ?? updateDoc;
  const ref = docFn(db, 'contacts', contactId);
  await updateDocFn(ref, patch as Record<string, unknown>);
}
