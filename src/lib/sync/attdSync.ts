import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { applyAttendance } from '../attendanceRoster';
import { visibleToOf, type ContactTies } from '../contactTies';
import type { Contact, Gathering, GatheringAttendance, Rhythm } from '../../types';
import type {
  AttendancePreview,
  AttdAttendanceStatus,
  PendingAttendanceImport,
} from './attdCorrelator';
import { isPresentStatus } from './attdCorrelator';

export const PENDING_IMPORTS_COLLECTION = 'pending_attendance_imports';
export const ATTENDEE_ALIASES_COLLECTION = 'attendee_aliases';
export const ATTD_EVENT_MAPPINGS_COLLECTION = 'integrations_attd_event_mappings';
export const INTEGRATIONS_SETTINGS_DOC = 'settings/integrations';

export function subscribePendingAttendanceImports(
  cb: (imports: PendingAttendanceImport[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const q = query(
    collection(db, PENDING_IMPORTS_COLLECTION),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((entry) => ({ ...(entry.data() as Omit<PendingAttendanceImport, 'id'>), id: entry.id } as PendingAttendanceImport))),
    (error) => (onError ? onError(error) : console.error('pending attendance imports subscription error', error)),
  );
}

export async function discardPendingAttendanceImport(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, PENDING_IMPORTS_COLLECTION, id), {
      status: 'discarded',
      discardedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PENDING_IMPORTS_COLLECTION}/${id}`);
    throw error;
  }
}

export interface AttendanceImportDecision {
  rowIndex: number;
  memberId: string | null;
  attdName: string;
  status: AttdAttendanceStatus;
  isLate: boolean;
  contactId: string | null;
  contactName: string | null;
  keepCisa: boolean;
}

export interface ConfirmAttendanceImportInput {
  importId: string;
  preview: AttendancePreview;
  decisions: AttendanceImportDecision[];
  contacts: Contact[];
  rhythms: Rhythm[];
  gatherings: Gathering[];
  targetRhythmId: string;
  targetGatheringId: string | null;
  createGathering: boolean;
  userId: string;
  userName: string;
}

const initialsFor = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  let value = '';
  for (const part of parts) {
    if (part.length > 0) value += part[0].toUpperCase();
  }
  return value.slice(0, 2);
};


export async function confirmAttendanceImport(input: ConfirmAttendanceImportInput): Promise<void> {
  const {
    importId,
    preview,
    decisions,
    contacts,
    rhythms,
    gatherings,
    targetRhythmId,
    targetGatheringId,
    createGathering,
    userId,
    userName,
  } = input;
  const now = new Date().toISOString();
  const contactById = new Map<string, Contact>();
  for (const contact of contacts) contactById.set(contact.id, contact);
  const targetRhythm = rhythms.find((entry) => entry.id === targetRhythmId);
  if (targetRhythm === undefined) {
    throw new Error('Choose a Rhythm before confirming.');
  }

  let gathering: Gathering | null = null;
  if (targetGatheringId) {
    for (const candidate of gatherings) {
      if (candidate.id === targetGatheringId) gathering = candidate;
    }
  }
  if (gathering === null && createGathering === false) {
    throw new Error('Choose a Gathering or create one.');
  }

  const batch = writeBatch(db);
  let createdEventRef: ReturnType<typeof doc> | null = null;
  if (gathering === null && createGathering) {
    createdEventRef = doc(collection(db, 'events'));
    gathering = {
      id: createdEventRef.id,
      name: targetRhythm.name,
      date: preview.sessionDate,
      order: gatherings.length,
      rhythmId: targetRhythm.id,
      createdAt: now,
    };
  }

  const existing = gathering ? gathering.attendance : undefined;
  let attendance: GatheringAttendance = { present: [], absent: [] };
  if (existing) {
    attendance = { present: [...existing.present], absent: [...existing.absent] };
  }

  const targetEventId = gathering ? gathering.id : null;

  for (const decision of decisions) {
    let contactId = decision.contactId;
    if (decision.keepCisa === false) {
      const mark = isPresentStatus(decision.status) ? 'present' : 'absent';
      if (contactId === null) {
        const contactRef = doc(collection(db, 'contacts'));
        const name = decision.contactName === null ? decision.attdName : decision.contactName;
        const contactData: Record<string, unknown> = {
          name,
          initials: initialsFor(name),
          role: 'Student',
          stage: 'Lead',
          email: '',
          location: '',
          lastSeen: preview.sessionDate,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
          createdByName: userName,
          updatedBy: userId,
          updatedByName: userName,
        };
        // `createdBy` is a persisted tie, so the denormalised access list the
        // rules read has to be written in the same breath (#1024 phase 4) --
        // otherwise the reviewer who just imported this walk-in cannot see them.
        contactData.visibleTo = visibleToOf(contactData as ContactTies);
        if (targetEventId) {
          contactData.attendance = { [targetEventId]: mark === 'present' ? true : 'absent' };
        }
        batch.set(contactRef, contactData);
        contactId = contactRef.id;
      } else {
        const existingContact = contactById.get(contactId);
        const legacyMap = existingContact
          ? ((existingContact as { attendance?: Record<string, boolean | 'absent' | 'late'> }).attendance ?? {})
          : {};
        if (targetEventId) {
          batch.update(doc(db, 'contacts', contactId), {
            attendance: { ...legacyMap, [targetEventId]: mark === 'present' ? true : 'absent' },
            updatedAt: now,
            updatedBy: userId,
            updatedByName: userName,
          });
        }
      }
      attendance = applyAttendance(attendance, contactId, mark);
    }

    if (contactId) {
      const aliasData = {
        attdMemberId: decision.memberId,
        attdName: decision.attdName,
        contactId,
        updatedAt: now,
        updatedBy: userId,
      };
      if (decision.memberId) {
        batch.set(doc(db, ATTENDEE_ALIASES_COLLECTION, decision.memberId), aliasData);
      } else {
        batch.set(doc(collection(db, ATTENDEE_ALIASES_COLLECTION)), aliasData);
      }
    }
  }

  if (createdEventRef) {
    batch.set(createdEventRef, {
      name: targetRhythm.name,
      date: preview.sessionDate,
      order: gathering ? gathering.order : gatherings.length,
      rhythmId: targetRhythm.id,
      createdAt: now,
      attendance,
      attendanceTakenAt: now,
    });
  } else {
    if (gathering) {
      batch.update(doc(db, 'events', gathering.id), { attendance, attendanceTakenAt: now });
    }
  }

  batch.set(doc(db, ATTD_EVENT_MAPPINGS_COLLECTION, preview.attdEventId), {
    attdEventId: preview.attdEventId,
    rhythmId: targetRhythmId,
    updatedAt: now,
    updatedBy: userId,
  });
  batch.update(doc(db, PENDING_IMPORTS_COLLECTION, importId), {
    status: 'confirmed',
    confirmedAt: now,
    confirmedBy: userId,
    targetRhythmId,
    targetGatheringId: gathering ? gathering.id : null,
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, PENDING_IMPORTS_COLLECTION);
    throw error;
  }
}
