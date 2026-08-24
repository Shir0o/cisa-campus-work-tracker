// Firestore CRUD + realtime subscription for the shared event collection.
// Maps between Firestore (Timestamps) and the typed CalendarEvent (Date).
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  Timestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { z } from 'zod';
import { calDb } from './firebase';
import type { CalendarEvent, RRule } from './types';

const COLL = 'events';

export const EventDocSchema = z.object({
  title: z.string(),
  cat: z.string(),
  start: z.unknown(),
  dur: z.number().nullable().optional(),
  allDay: z.boolean().optional(),
  end: z.unknown().optional(),
  loc: z.string().optional(),
  notes: z.string().optional(),
  rrule: z.unknown().nullable().optional(),
  gcalUid: z.string().optional(),
  gcalFeedId: z.string().optional(),
  syncOrigin: z.literal('gcal').optional(),
  lastModified: z.unknown().nullable().optional(),
}).passthrough();

export type EventDoc = z.infer<typeof EventDocSchema>;

function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof (v as any)?.toDate === 'function') return (v as any).toDate();
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  return undefined;
}

export function fromDoc(id: string, data: DocumentData): CalendarEvent {
  const rruleRaw = data.rrule as (Omit<RRule, 'until'> & { until?: unknown }) | undefined;
  const rrule: RRule | undefined = rruleRaw
    ? { ...rruleRaw, until: toDate(rruleRaw.until) }
    : undefined;

  const allDay = data.allDay ?? false;
  let start = toDate(data.start) ?? new Date();
  let end = toDate(data.end);

  if (allDay) {
    const s = toDate(data.start) ?? new Date();
    start = new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    if (data.end) {
      const e = toDate(data.end)!;
      end = new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
    }
  }

  return {
    id,
    title: data.title ?? 'Untitled event',
    cat: data.cat ?? 'meeting',
    start,
    dur: data.dur ?? undefined,
    allDay,
    end,
    loc: data.loc ?? '',
    notes: data.notes ?? '',
    rrule,
    syncOrigin: data.syncOrigin ?? undefined,
    gcalFeedId: data.gcalFeedId ?? undefined,
  };
}

// Drop undefined values — Firestore rejects them.
function clean<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function toFirestore(ev: CalendarEvent): Record<string, unknown> {
  const rrule = ev.rrule
    ? clean({
        freq: ev.rrule.freq,
        interval: ev.rrule.interval,
        byday: ev.rrule.byday,
        count: ev.rrule.count,
        exdates: ev.rrule.exdates,
        until: ev.rrule.until ? Timestamp.fromDate(ev.rrule.until) : undefined,
      })
    : undefined;

  let start = ev.start;
  let end = ev.end;

  if (ev.allDay) {
    start = new Date(Date.UTC(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate()));
    if (ev.end) {
      end = new Date(Date.UTC(ev.end.getFullYear(), ev.end.getMonth(), ev.end.getDate()));
    }
  }

  return clean({
    title: ev.title,
    cat: ev.cat,
    start: Timestamp.fromDate(start),
    dur: ev.dur,
    allDay: ev.allDay ?? false,
    end: end ? Timestamp.fromDate(end) : undefined,
    loc: ev.loc,
    notes: ev.notes,
    rrule,
    syncOrigin: ev.syncOrigin,
    gcalFeedId: ev.gcalFeedId,
  });
}

export function subscribeCalendarEvents(
  cb: (events: CalendarEvent[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    collection(calDb, COLL),
    (snap) => {
      const out: CalendarEvent[] = [];
      for (const d of snap.docs) {
        const parsed = EventDocSchema.safeParse(d.data());
        if (!parsed.success) {
          console.warn(`subscribeCalendarEvents: skipping doc ${d.id}`, parsed.error.issues);
          continue;
        }
        out.push(fromDoc(d.id, parsed.data));
      }
      cb(out);
    },
    (err) => onError?.(err),
  );
}

export async function saveCalendarEvent(ev: CalendarEvent): Promise<void> {
  await setDoc(doc(calDb, COLL, ev.id), toFirestore(ev), { merge: true });
}

export async function saveCalendarEventsBatch(events: CalendarEvent[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < events.length; i += CHUNK) {
    const batch = writeBatch(calDb);
    for (const ev of events.slice(i, i + CHUNK)) {
      batch.set(doc(calDb, COLL, ev.id), toFirestore(ev), { merge: true });
    }
    await batch.commit();
  }
}

export async function removeCalendarEvent(id: string): Promise<void> {
  await deleteDoc(doc(calDb, COLL, id));
}

export async function removeCalendarEventsBatch(ids: string[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = writeBatch(calDb);
    for (const id of ids.slice(i, i + CHUNK)) {
      batch.delete(doc(calDb, COLL, id));
    }
    await batch.commit();
  }
}

export const saveEventsBatch = saveCalendarEventsBatch;
export const removeEventsBatch = removeCalendarEventsBatch;

