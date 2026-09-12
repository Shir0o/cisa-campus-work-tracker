// Rhythm CRUD + occurrence generation (issue #957 / ADR 0016). A Rhythm is a
// standalone Firestore record (name/cadence/location/roster/term) — occasions
// are plain `events` docs carrying `rhythmId`. Generation is pure so it's
// unit-testable and shared between `extendRhythmTerm` (grow the term) and
// `repairRhythmOccurrences` (fill any gap between what the cadence implies and
// what actually exists).
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { Gathering, Rhythm } from '../types';

const col = () => collection(db, 'rhythms');

// ── date helpers (local, date-only — mirrors gatheringViewModel.ts) ────────

const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const formatLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDaysLocal = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

const weekOfMonth = (d: Date): number => Math.ceil(d.getDate() / 7);

const nthWeekdayOfMonth = (year: number, month: number, weekday: number, nth: number): Date => {
  const first = new Date(year, month, 1);
  const firstWeekdayOffset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + firstWeekdayOffset + (nth - 1) * 7;
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  if (day > lastDayOfMonth) {
    // Fall back to the last occurrence of that weekday in the month.
    let d = new Date(year, month, lastDayOfMonth);
    while (d.getDay() !== weekday) d = addDaysLocal(d, -1);
    return d;
  }
  return new Date(year, month, day);
};

/**
 * Pure occurrence generator: every date the cadence implies between
 * `fromDate` and `toDate` (inclusive), anchored to `anchorDate` (the Rhythm's
 * `termStart`, which fixes which weekday/day-of-month/ordinal the cadence
 * means).
 */
export function generateOccurrenceDates(
  cadence: Rhythm['cadence'],
  anchorDate: string,
  fromDate: string,
  toDate: string,
): string[] {
  const anchor = parseLocalDate(anchorDate);
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  if (to.getTime() < from.getTime()) return [];

  const out: string[] = [];

  if (cadence.type === 'weekly') {
    const days = cadence.days.length > 0 ? cadence.days : [anchor.getDay()];
    let cur = new Date(from);
    let safety = 10_000;
    while (cur.getTime() <= to.getTime() && safety-- > 0) {
      if (days.includes(cur.getDay())) out.push(formatLocal(cur));
      cur = addDaysLocal(cur, 1);
    }
    return out;
  }

  // monthly
  const anchorWeekday = anchor.getDay();
  const anchorNth = weekOfMonth(anchor);
  const anchorDom = anchor.getDate();
  let cursorYear = from.getFullYear();
  let cursorMonth = from.getMonth();
  let safety = 1000;
  while (safety-- > 0) {
    let occ: Date;
    if (cadence.monthlyType === 'relative-day') {
      occ = nthWeekdayOfMonth(cursorYear, cursorMonth, anchorWeekday, anchorNth);
    } else {
      const lastDay = new Date(cursorYear, cursorMonth + 1, 0).getDate();
      occ = new Date(cursorYear, cursorMonth, Math.min(anchorDom, lastDay));
    }
    if (occ.getTime() > to.getTime()) break;
    if (occ.getTime() >= from.getTime()) out.push(formatLocal(occ));
    cursorMonth += 1;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
  }
  return out;
}

/** Occurrence dates missing from `existingDates` for the given cadence/range. */
export function diffMissingOccurrences(
  cadence: Rhythm['cadence'],
  anchorDate: string,
  fromDate: string,
  toDate: string,
  existingDates: readonly string[],
): string[] {
  const existing = new Set(existingDates);
  return generateOccurrenceDates(cadence, anchorDate, fromDate, toDate).filter((d) => !existing.has(d));
}

// ── subscription ────────────────────────────────────────────────────────────

export function subscribeRhythms(
  cb: (rhythms: Rhythm[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(), orderBy('name', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Rhythm[]),
    (e) => (onError ? onError(e) : console.error('rhythms subscription error', e)),
  );
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export interface CreateRhythmInput {
  name: string;
  cadence: Rhythm['cadence'];
  location?: string;
  roster: string[];
  termStart: string;
  termEnd: string;
  createdById: string;
}

/** Creates the Rhythm doc and every occasion its cadence implies over the
 *  initial term. Returns the new Rhythm's id. */
export async function createRhythm(input: CreateRhythmInput): Promise<string> {
  try {
    const rhythmRef = doc(col());
    const rhythm: Omit<Rhythm, 'id'> = {
      name: input.name.trim(),
      cadence: input.cadence,
      ...(input.location?.trim() ? { location: input.location.trim() } : {}),
      roster: input.roster,
      termStart: input.termStart,
      termEnd: input.termEnd,
      createdAt: new Date().toISOString(),
      createdById: input.createdById,
    };

    const dates = generateOccurrenceDates(input.cadence, input.termStart, input.termStart, input.termEnd);
    const batch = writeBatch(db);
    batch.set(rhythmRef, rhythm);
    dates.forEach((date, i) => {
      const evRef = doc(collection(db, 'events'));
      batch.set(evRef, {
        name: input.name.trim(),
        date,
        order: i,
        rhythmId: rhythmRef.id,
        createdAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    return rhythmRef.id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'rhythms');
    throw e;
  }
}

/** Updates the Rhythm's own fields (name/cadence/location/roster/term).
 *  Occasions aren't rewritten — a name change reads through live for
 *  present/future rows; past rows stay frozen (per `resolveRoster`). */
export interface RhythmPatch {
  name?: string;
  cadence?: Rhythm['cadence'];
  /** `null` (or an empty string) clears the location; `undefined` leaves it. */
  location?: string | null;
  roster?: string[];
  termStart?: string;
  termEnd?: string;
}

export async function updateRhythm(id: string, patch: RhythmPatch): Promise<void> {
  try {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'location') continue;
      if (value !== undefined) data[key] = value;
    }
    if ('location' in patch) {
      const loc = patch.location?.trim();
      data.location = loc ? loc : deleteField();
    }
    await updateDoc(doc(db, 'rhythms', id), data);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `rhythms/${id}`);
  }
}

export async function deleteRhythm(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rhythms', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `rhythms/${id}`);
  }
}

/** Grows a Rhythm's term: generates the occasions its cadence implies between
 *  the old `termEnd` (exclusive) and `newTermEnd`, then writes the new
 *  `termEnd`. */
export async function extendRhythmTerm(
  rhythm: Rhythm,
  newTermEnd: string,
  existingGatherings: readonly Gathering[],
): Promise<void> {
  try {
    const existingDates = existingGatherings.filter((g) => g.rhythmId === rhythm.id).map((g) => g.date);
    const dates = diffMissingOccurrences(rhythm.cadence, rhythm.termStart, rhythm.termEnd, newTermEnd, existingDates);
    const batch = writeBatch(db);
    const baseOrder = existingGatherings.length;
    dates.forEach((date, i) => {
      const evRef = doc(collection(db, 'events'));
      batch.set(evRef, {
        name: rhythm.name,
        date,
        order: baseOrder + i,
        rhythmId: rhythm.id,
        createdAt: new Date().toISOString(),
      });
    });
    batch.update(doc(db, 'rhythms', rhythm.id), { termEnd: newTermEnd });
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `rhythms/${rhythm.id}`);
  }
}

/** Fills any gap between what the cadence implies over the current term and
 *  what actually exists — repairs a Rhythm whose occasions fell out of sync
 *  (e.g. a doc was deleted by hand). Does not change `termEnd`. */
export async function repairRhythmOccurrences(
  rhythm: Rhythm,
  existingGatherings: readonly Gathering[],
): Promise<void> {
  try {
    const existingDates = existingGatherings.filter((g) => g.rhythmId === rhythm.id).map((g) => g.date);
    const dates = diffMissingOccurrences(rhythm.cadence, rhythm.termStart, rhythm.termStart, rhythm.termEnd, existingDates);
    if (dates.length === 0) return;
    const batch = writeBatch(db);
    const baseOrder = existingGatherings.length;
    dates.forEach((date, i) => {
      const evRef = doc(collection(db, 'events'));
      batch.set(evRef, {
        name: rhythm.name,
        date,
        order: baseOrder + i,
        rhythmId: rhythm.id,
        createdAt: new Date().toISOString(),
      });
    });
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `rhythms/${rhythm.id}`);
  }
}

/** Firestore write wrapper: cancel one occasion of a Rhythm (or a one-off). */
export async function cancelGatheringForRhythm(gatheringId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'events', gatheringId), { cancelled: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `events/${gatheringId}`);
  }
}

/** Firestore write wrapper: undo a cancellation. Named distinctly from
 *  attendanceRoster.ts's pure `uncancelGathering(gathering) => gathering` —
 *  this one is a Firestore RPC taking just an id. */
export async function uncancelGatheringDoc(gatheringId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'events', gatheringId), { cancelled: false });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `events/${gatheringId}`);
  }
}

/** All occasions (cancelled or not) belonging to a Rhythm, for the drawer's
 *  cancelled-weeks list. */
export async function fetchRhythmGatherings(rhythmId: string): Promise<Gathering[]> {
  const snap = await getDocs(query(collection(db, 'events'), where('rhythmId', '==', rhythmId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Gathering[];
}
