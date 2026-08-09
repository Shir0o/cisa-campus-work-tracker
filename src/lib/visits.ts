// Visits — the reading logic and the Firestore writes behind the Visits page.
//
// A visit is a record of having gone to where someone lives. The source of
// truth is the `visits` doc; each person we saw also gets a mirrored
// interaction on their own card ("Visited at …"), so someone reading a contact
// sees the whole story without knowing the Visits page exists. The mirror's id
// is derived from the visit id, so edits and removals need no bookkeeping — we
// can always work out which copy belongs to which visit.
//
// Every date here is a 'YYYY-MM-DD' day string, parsed at local noon so that a
// timezone offset can never nudge a visit into the wrong day.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Contact, Visit, VisitPhoto } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** How long a relationship can go unvisited before the page nudges about it. */
export const OVERDUE_VISIT_DAYS = 21;
/** The nudge strip is a nudge, not a backlog — it stays short on purpose. */
export const OVERDUE_VISIT_LIMIT = 4;

// ── reading ──────────────────────────────────────────────────────────────────

/** Parse a 'YYYY-MM-DD' day string at local noon. */
export function visitDate(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

const noonOf = (d: Date): Date => {
  const n = new Date(d);
  n.setHours(12, 0, 0, 0);
  return n;
};

/** Monday of the week a date falls in, at local noon. */
const mondayOf = (d: Date): Date => {
  const m = noonOf(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};

export function visitDayNum(day: string): number {
  return visitDate(day).getDate();
}

export function visitMonth(day: string): string {
  return MONTHS[visitDate(day).getMonth()];
}

/** Whole days between the visit and today. Negative for a future date. */
export function visitDaysAgo(day: string, now: Date = new Date()): number {
  return Math.round((noonOf(now).getTime() - visitDate(day).getTime()) / DAY_MS);
}

/** 0 = the week we're in (Monday-start), 1 = last week, 2+ = earlier. */
export function visitWeeksAgo(day: string, now: Date = new Date()): number {
  return Math.max(0, Math.round((mondayOf(now).getTime() - mondayOf(visitDate(day)).getTime()) / WEEK_MS));
}

/** How a person would say when it was: today, yesterday, a weekday inside the
 *  last week, or a date beyond that. */
export function visitWhen(day: string, now: Date = new Date()): string {
  const n = visitDaysAgo(day, now);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return DAYS[visitDate(day).getDay()];
  return `${visitMonth(day)} ${visitDayNum(day)}`;
}

const newestFirst = (a: Visit, b: Visit): number => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export interface GroupedVisits {
  thisWeek: Visit[];
  lastWeek: Visit[];
  earlier: Visit[];
}

/** The page's three sections, each newest first. */
export function groupVisits(visits: Visit[], now: Date = new Date()): GroupedVisits {
  const sorted = visits.slice().sort(newestFirst);
  return {
    thisWeek: sorted.filter((v) => visitWeeksAgo(v.date, now) === 0),
    lastWeek: sorted.filter((v) => visitWeeksAgo(v.date, now) === 1),
    earlier: sorted.filter((v) => visitWeeksAgo(v.date, now) > 1),
  };
}

/** Every visit a person was part of, newest first. */
export function visitsFor(visits: Visit[], contactId: string): Visit[] {
  return visits.filter((v) => (v.contactIds || []).includes(contactId)).sort(newestFirst);
}

export function lastVisitFor(visits: Visit[], contactId: string): Visit | null {
  return visitsFor(visits, contactId)[0] || null;
}

export interface OverdueVisit {
  contact: Contact;
  visit: Visit;
  daysAgo: number;
}

/** People we've been to before, but not lately, longest-neglected first.
 *
 *  Never-visited people are left out on purpose: this strip is about letting a
 *  relationship lapse, not about working through everyone we've never seen. */
export function overdueVisits(
  visits: Visit[],
  contacts: Contact[],
  now: Date = new Date(),
  opts: { minDays?: number; limit?: number } = {},
): OverdueVisit[] {
  const minDays = opts.minDays ?? OVERDUE_VISIT_DAYS;
  const limit = opts.limit ?? OVERDUE_VISIT_LIMIT;
  return contacts
    .map((contact) => {
      const visit = lastVisitFor(visits, contact.id);
      return visit ? { contact, visit, daysAgo: visitDaysAgo(visit.date, now) } : null;
    })
    .filter((x): x is OverdueVisit => x !== null && x.daysAgo >= minDays)
    .sort((a, b) => b.daysAgo - a.daysAgo)
    .slice(0, limit);
}

/** The quiet figures in the page footer. Counted only so we notice whose door
 *  we haven't knocked on. */
export function visitStats(visits: Visit[]): { visits: number; peopleSeen: number; wentOut: number } {
  const seen = new Set<string>();
  const went = new Set<string>();
  visits.forEach((v) => {
    (v.contactIds || []).forEach((id) => seen.add(id));
    (v.went || []).forEach((id) => went.add(id));
  });
  return { visits: visits.length, peopleSeen: seen.size, wentOut: went.size };
}

/** "Ama", "Ama and Bo", "Ama, Bo and Cai". */
export function andList(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Two letters for an avatar. Falls back to the first two letters of a single
 *  name, and to '?' when there's nothing to work with. */
export function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

// ── writing ──────────────────────────────────────────────────────────────────

/** Everything a visit needs, minus the audit fields the writer stamps. */
export interface VisitInput {
  date: string;
  contactIds: string[];
  contactNames: string[];
  went: string[];
  wentNames: string[];
  where: string;
  purpose: string;
  how: string;
  followUp: string;
  followUpTaskId?: string | null;
  prayerId?: string | null;
  photos?: VisitPhoto[];
}

export interface VisitAuthor {
  uid: string;
  name: string;
  photoURL?: string | null;
}

/** The mirrored interaction's id, derived from the visit so the pair can always
 *  be found again. Stays within `isValidId`'s ^[a-zA-Z0-9_-]+$. */
export const visitInteractionId = (visitId: string): string => `visit_${visitId}`;

/** Live subscription to every visit, newest first. */
export function subscribeVisits(cb: (visits: Visit[]) => void, onError?: (e: unknown) => void): () => void {
  return onSnapshot(
    query(collection(db, 'visits'), orderBy('date', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Visit)),
    (e) => (onError ? onError(e) : console.error('visits subscription error', e)),
  );
}

const cleanInput = (input: VisitInput) => ({
  date: input.date,
  contactIds: input.contactIds,
  contactNames: input.contactNames,
  went: input.went,
  wentNames: input.wentNames,
  where: input.where.trim(),
  purpose: input.purpose.trim(),
  how: input.how.trim(),
  followUp: input.followUp.trim(),
  followUpTaskId: input.followUpTaskId ?? null,
  prayerId: input.prayerId ?? null,
  photos: input.photos ?? [],
});

/** What a visit reads as on the person's own card. The Conversations tab shows
 *  `content` and nothing else, so the where has to live inside it. */
export function visitMirrorContent(input: Pick<VisitInput, 'how' | 'purpose' | 'where'>): string {
  const lead = `Visited at ${input.where.trim() || 'home'}`;
  const body = input.how.trim() || input.purpose.trim();
  return body ? `${lead} — ${body}` : lead;
}

/** Write the visit, then mirror it onto everyone we saw.
 *
 *  The visit doc lands first so photos have somewhere to belong; the caller
 *  uploads them and calls `attachVisitPhotos` once they're up. */
export async function addVisit(input: VisitInput, by: VisitAuthor): Promise<string> {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'visits'), {
    ...cleanInput(input),
    createdAt: now,
    createdById: by.uid,
    createdByName: by.name,
    updatedAt: now,
    updatedBy: by.uid,
    updatedByName: by.name,
  });
  const id = ref?.id ?? 'new-visit-id';
  await syncVisitMirrors(id, [], input, by);
  return id;
}

/** Patch a visit and bring its mirrors back in line with who's on it now. */
export async function updateVisit(
  visitId: string,
  previousContactIds: string[],
  input: VisitInput,
  by: VisitAuthor,
): Promise<void> {
  await updateDoc(doc(db, 'visits', visitId), {
    ...cleanInput(input),
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid,
    updatedByName: by.name,
  });
  await syncVisitMirrors(visitId, previousContactIds, input, by);
}

/** Store the uploaded photos on an already-created visit. */
export async function attachVisitPhotos(visitId: string, photos: VisitPhoto[]): Promise<void> {
  await updateDoc(doc(db, 'visits', visitId), { photos });
}

/** Remove the visit from the record, and from every card it was mirrored onto. */
export async function deleteVisit(visit: Pick<Visit, 'id' | 'contactIds'>): Promise<void> {
  await Promise.all((visit.contactIds || []).map((cid) => removeMirror(cid, visit.id)));
  await deleteDoc(doc(db, 'visits', visit.id));
}

const mirrorRef = (contactId: string, visitId: string) =>
  doc(db, 'contacts', contactId, 'interactions', visitInteractionId(visitId));

const removeMirror = async (contactId: string, visitId: string): Promise<void> => {
  await deleteDoc(mirrorRef(contactId, visitId)).catch(() => {
    /* Already gone — the record is what matters, not the copy. */
  });
};

/** Create, update or drop each person's copy so it matches the visit.
 *
 *  Creates and updates go down different paths on purpose: the interactions
 *  create rule demands `createdAt == request.time`, and the update rule only
 *  lets content/dateTime/type/userName/userPhoto change — so an edit must not
 *  restate createdAt or userId. */
async function syncVisitMirrors(
  visitId: string,
  previousContactIds: string[],
  input: VisitInput,
  by: VisitAuthor,
): Promise<void> {
  const nextIds = input.contactIds;
  const gone = previousContactIds.filter((id) => !nextIds.includes(id));
  const content = visitMirrorContent(input);

  await Promise.all([
    ...gone.map((cid) => removeMirror(cid, visitId)),
    ...nextIds.map(async (cid) => {
      const ref = mirrorRef(cid, visitId);
      const existing = await getDoc(ref);
      if (existing?.exists?.()) {
        await updateDoc(ref, { content, dateTime: input.date, type: 'visit', userName: by.name });
      } else {
        await setDoc(ref, {
          userId: by.uid,
          userName: by.name,
          userPhoto: by.photoURL || '',
          content,
          dateTime: input.date,
          type: 'visit',
          createdAt: serverTimestamp(),
        });
      }
      // A visit is the strongest kind of contact there is — it should move the
      // person's "last seen", not just sit in their history. Only the fields
      // the contacts update rule allows are touched here.
      await updateDoc(doc(db, 'contacts', cid), {
        lastSeen: input.date,
        updatedAt: new Date().toISOString(),
        updatedBy: by.uid,
        updatedByName: by.name,
      }).catch(() => {
        /* The visit is the record; a stale lastSeen isn't worth failing the save. */
      });
    }),
  ]);
}
