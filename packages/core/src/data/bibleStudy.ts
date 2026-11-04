// @cisa/core mirror of the web app's src/lib/data/bibleStudy.ts — keep in step.
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import {
  nextMeetingDateAfter,
  type Meeting,
  type Section,
  type Study,
  type EntryPoint,
} from '../bibleStudy';

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

/**
 * Subscribes to published meetings for a study (used by public readers).
 */
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
 * Subscribes to all meetings for a study (drafts + published, staff authoring).
 */
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


/**
 * Subscribes to a single meeting by id.
 */
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

/**
 * Create or save a meeting draft.
 */
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

/**
 * Firestore rejects nested `undefined` — a parsed Section's optional fields
 * (passage, ref, prompt) are absent on most sections, and the SDK validates
 * before any wire call, so the whole save fails opaquely. Strip them;
 * `undefined` and absent mean the same thing in every reader.
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/** The fields a brand-new week starts with; the date and id are derived. */
export type NewMeeting = {
  studyId: string;
  title: string;
  sections: Section[];
  md: string;
};

/**
 * The date the study's newest week occupies, read from the store at the
 * moment a week is created. The caller's list is a snapshot from when the
 * screen mounted and can be badly stale: a previous week corrected from
 * today's date in another tab still sat at today, which pushed New week to
 * next week instead of today. Only a failed read falls back to that list.
 */
async function newestStoredMeetingDate(
  db: Firestore,
  studyId: string,
  fallback: Meeting[],
): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'bible_study_meetings'),
        where('studyId', '==', studyId),
        orderBy('date', 'desc'),
        limit(1),
      ),
    );
    return snap.docs.map((d) => String(d.data().date ?? '')).filter(Boolean);
  } catch {
    return fallback.map((m) => m.date);
  }
}

/**
 * Claims one date for a new week and returns its document id, or `null` when
 * a week already sits on that date. The id is the date, as every week's has
 * been — but only while it is free: editing a week's date leaves its old id
 * behind (the previous week was created for 4 Nov and later moved to 28 Oct),
 * so a new week for that date takes a suffixed id instead of being pushed a
 * week later.
 */
async function claimWeek(
  db: Firestore,
  draft: NewMeeting,
  date: string,
  userId?: string,
): Promise<string | null> {
  for (let n = 1; n <= 52; n++) {
    const id = n === 1 ? `${draft.studyId}-${date}` : `${draft.studyId}-${date}-${n}`;
    const ref = doc(db, 'bible_study_meetings', id);
    const outcome = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        // A week on this date means the date is taken. An id held by a week
        // whose date was edited away is only a used label.
        return snap.data()?.date === date ? 'taken' : 'label-used';
      }
      tx.set(ref, {
        ...stripUndefined({
          id,
          studyId: draft.studyId,
          date,
          title: draft.title,
          sections: draft.sections,
          published: false,
          md: draft.md,
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId || null,
      });
      return 'claimed';
    });
    if (outcome === 'claimed') return id;
    if (outcome === 'taken') return null;
  }
  return null;
}

/**
 * Creates the next week. Unlike `saveMeeting`, this never merges: a week at
 * the computed date may already exist that the caller's list does not know
 * about (a cold cache, a stale tab, a week prepared on another device), and
 * merging the skeleton into it would blank someone's study. The date is
 * claimed in a transaction and, if it is taken, the week moves to the next
 * free one.
 */
export async function createMeeting(
  db: Firestore,
  draft: NewMeeting,
  meetings: Meeting[],
  today: string,
  userId?: string,
): Promise<Meeting> {
  let knownDates = await newestStoredMeetingDate(db, draft.studyId, meetings);
  for (let attempt = 0; attempt < 52; attempt++) {
    const date = nextMeetingDateAfter(knownDates, today);
    const id = await claimWeek(db, draft, date, userId);
    if (id) return { id, ...draft, date, published: false };
    // Someone got there first — ask for the week after it.
    knownDates = [...knownDates, date];
  }
  throw new Error('No free week to create');
}

/**
 * Publishes or unpublishes a meeting.
 */
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

/**
 * Deletes a meeting.
 */
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

/**
 * Deletes a Study and all meetings belonging to it (#1937).
 * Used when cleaning up test terms or terms entered in error. The rules refuse
 * deleting a published Meeting (ADR 0011), so published weeks are unpublished
 * first. Repoint any Entry point off this Study before calling this.
 */
export async function deleteStudy(db: Firestore, studyId: string): Promise<void> {
  const q = query(collection(db, 'bible_study_meetings'), where('studyId', '==', studyId));
  const snap = await getDocs(q);
  await Promise.all(
    snap.docs.map(async (d) => {
      if (d.data().published === true) {
        await updateDoc(d.ref, { published: false, updatedAt: serverTimestamp() });
      }
      await deleteDoc(d.ref);
    }),
  );
  await deleteDoc(doc(db, 'bible_study_studies', studyId));
}

/**
 * Deletes an Entry point (room code) document.
 * Used when cleaning up duplicate, test, or leftover codes.
 */
export async function deleteEntryPoint(db: Firestore, slug: string): Promise<void> {
  await deleteDoc(doc(db, 'bible_study_entry_points', slug));
}
