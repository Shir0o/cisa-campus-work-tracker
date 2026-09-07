// Bible study data (#822) — the web app has no dependency on @cisa/core
// (mobile-only package), so this mirrors packages/core/src/data/bibleStudy.ts
// for the web side; keep the two in step.
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
import type { Meeting, Study, EntryPoint } from '../bibleStudy';

function mapMeeting(d: { id: string; data: () => Record<string, any> }): Meeting {
  const data = d.data();
  return {
    id: d.id,
    studyId: data.studyId || '',
    date: data.date || '',
    title: data.title || '',
    sections: data.sections || [],
    published: !!data.published,
    md: data.md,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdBy: data.createdBy,
  };
}


function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function mapStudy(d: { id: string; data: () => Record<string, unknown> }): Study {
  const data = d.data();
  return {
    id: d.id,
    title: str(data.title),
    term: str(data.term),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdBy: str(data.createdBy) || undefined,
  };
}

function mapEntryPoint(d: { id: string; data: () => Record<string, unknown> }): EntryPoint {
  const data = d.data();
  return {
    id: d.id,
    slug: str(data.slug, d.id),
    name: str(data.name),
    activeStudyId: typeof data.activeStudyId === 'string' ? data.activeStudyId : null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdBy: str(data.createdBy) || undefined,
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

/**
 * Subscribes to every Entry point. v1 seeds exactly one; a split week makes
 * a second.
 */
export function subscribeEntryPoints(
  db: Firestore,
  cb: (entryPoints: EntryPoint[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  const q = query(collection(db, 'bible_study_entry_points'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapEntryPoint)),
    (e) => (onError ? onError(e) : console.error('entry points sub error', e)),
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


/**
 * Subscribes to a Study by id (publicly readable).
 */
export function subscribeStudy(
  db: Firestore,
  studyId: string,
  cb: (study: Study | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'bible_study_studies', studyId),
    (snap) => cb(snap.exists() ? mapStudy(snap) : null),
    (e) => (onError ? onError(e) : console.error('study sub error', e)),
  );
}

/**
 * Subscribes to an Entry point by slug — the slug is the document id, so the
 * durable URL is a stable lookup.
 */
export function subscribeEntryPoint(
  db: Firestore,
  slug: string,
  cb: (entryPoint: EntryPoint | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'bible_study_entry_points', slug),
    (snap) => cb(snap.exists() ? mapEntryPoint(snap) : null),
    (e) => (onError ? onError(e) : console.error('entry point sub error', e)),
  );
}


/**
 * Creates the Study a term's weeks belong to (#822). Written from the client
 * by a Full-timer — the rules already permit exactly that (firestore.rules
 * `bible_study_studies`, EP3); nothing in the app used to call it, which is
 * why starting a study needed a service-account key and a terminal.
 *
 * The document carries no `id` field: the rules' `hasOnly` list forbids one,
 * and the document id is the id. Writing the same title and term twice
 * derives the same id and rewrites an identical record.
 */
export async function createStudy(
  db: Firestore,
  study: { id: string; title: string; term: string },
  userId?: string,
): Promise<string> {
  await setDoc(doc(db, 'bible_study_studies', study.id), {
    title: study.title,
    term: study.term,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId || null,
  });
  return study.id;
}

/**
 * Creates the Entry point a QR encodes. The slug is the document id and must
 * equal the `slug` field (rules EP4) — it is the durable half of the design,
 * so this is called once and then never again for that code.
 */
export async function createEntryPoint(
  db: Firestore,
  entryPoint: { slug: string; name: string; activeStudyId: string | null },
  userId?: string,
): Promise<string> {
  await setDoc(doc(db, 'bible_study_entry_points', entryPoint.slug), {
    slug: entryPoint.slug,
    name: entryPoint.name,
    activeStudyId: entryPoint.activeStudyId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId || null,
  });
  return entryPoint.slug;
}

/**
 * Points an existing Entry point at a different Study — this is what starting
 * a new term *is* (ADR 0011). The URL on the poster never changes; `null`
 * leaves the code between terms.
 */
export async function setActiveStudy(
  db: Firestore,
  slug: string,
  studyId: string | null,
): Promise<void> {
  await updateDoc(doc(db, 'bible_study_entry_points', slug), {
    activeStudyId: studyId,
    updatedAt: serverTimestamp(),
  });
}
