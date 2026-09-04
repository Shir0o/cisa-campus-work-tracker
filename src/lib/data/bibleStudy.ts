import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { Meeting } from '../bibleStudy';

function mapMeeting(d: { id: string; data: () => Record<string, any> }): Meeting {
  const data = d.data();
  return {
    id: d.id,
    studyId: data.studyId || '',
    date: data.date || '',
    title: data.title || '',
    sections: data.sections || [],
    published: !!data.published,
    siblingId: data.siblingId,
    md: data.md,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdBy: data.createdBy,
  };
}

export function subscribePublishedStudyMeetings(
  db: Firestore,
  studyId: string,
  cb: (meetings: Meeting[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const q = query(
    collection(db, 'bible_study_meetings'),
    where('studyId', '==', studyId),
    where('published', '==', true),
    orderBy('date', 'desc'),
  );

  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapMeeting)),
    (e) => (onError ? onError(e) : console.error('published study meetings sub error', e)),
  );
}

export function subscribeStudyMeetings(
  db: Firestore,
  studyId: string,
  cb: (meetings: Meeting[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const q = query(
    collection(db, 'bible_study_meetings'),
    where('studyId', '==', studyId),
    orderBy('date', 'desc'),
  );

  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapMeeting)),
    (e) => (onError ? onError(e) : console.error('study meetings sub error', e)),
  );
}

export function subscribeMeeting(
  db: Firestore,
  meetingId: string,
  cb: (meeting: Meeting | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'bible_study_meetings', meetingId),
    (snap) => cb(snap.exists() ? mapMeeting(snap) : null),
    (e) => (onError ? onError(e) : console.error('meeting sub error', e)),
  );
}

export async function saveMeeting(
  db: Firestore,
  meeting: Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  userId?: string,
): Promise<string> {
  const meetingId = meeting.id || `${meeting.studyId}-${meeting.date}`;
  const meetingRef = doc(db, 'bible_study_meetings', meetingId);

  await setDoc(
    meetingRef,
    {
      ...meeting,
      id: meetingId,
      updatedAt: serverTimestamp(),
      ...(meeting.id ? {} : { createdAt: serverTimestamp(), createdBy: userId || null }),
    },
    { merge: true },
  );

  return meetingId;
}

export async function setMeetingPublished(
  db: Firestore,
  meetingId: string,
  published: boolean,
): Promise<void> {
  const meetingRef = doc(db, 'bible_study_meetings', meetingId);
  await updateDoc(meetingRef, {
    published,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMeeting(db: Firestore, meetingId: string): Promise<void> {
  await deleteDoc(doc(db, 'bible_study_meetings', meetingId));
}
