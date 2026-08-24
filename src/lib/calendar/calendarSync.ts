// ============================================================
// THE SHARED CALENDAR, READ INTO THIS APP
// Source: github.com/Shir0o/shared-calendar
//
// One-way: Calendar → app. NOTHING here ever writes back: the calendar has no
// attendees field ("events have NO attendees"), so a roster could not go back
// even if we wanted it to. The calendar owns *when and where*; this app owns
// *who was there and what it did for them*.
//
// Everything synced is FULL-TIMER / ADMIN / MANAGER ONLY.
// ============================================================

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { calDb } from './firebase';

export interface CalCategory {
  id: string;
  label: string;
  dot: string;
}

export const CAL_CATEGORIES: CalCategory[] = [
  { id: 'product', label: 'Product', dot: '#705335' },
  { id: 'meeting', label: 'Meeting', dot: '#63599e' },
  { id: 'social', label: 'Social', dot: '#486349' },
  { id: 'workshop', label: 'Workshop', dot: '#8f485d' },
  { id: 'deadline', label: 'Deadline', dot: '#944a38' },
  { id: 'travel', label: 'Travel', dot: '#2c636f' },
  { id: 'holiday', label: 'Holiday', dot: '#725c10' },
];

export const CAL_CAT_BY_ID: Record<string, CalCategory> = Object.fromEntries(
  CAL_CATEGORIES.map((c) => [c.id, c]),
);

export interface CalRRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  byday?: string[];
  until?: string;
  count?: number;
  exdates?: string[];
}

export interface CalRawEvent {
  id: string;
  title: string;
  cat: string;
  start: Date;
  end?: Date;
  dur?: number;
  allDay?: boolean;
  loc?: string;
  notes?: string;
  rrule?: CalRRule;
  __seriesId?: string;
  __instanceDate?: string;
}

export interface CalGatheringItem {
  id: string;
  title: string;
  type: string;
  date: Date;
  time: string;
  location: string;
  attended: string[];
  synced: true;
  cat: string;
  seriesId: string;
}

export interface CalAwayItem {
  id: string;
  who: { name: string; id?: string } | null;
  title: string;
  from: Date;
  to: Date;
  synced: true;
}

export interface CalContextItem {
  id: string;
  title: string;
  date: Date;
  to: Date;
  allDay: boolean;
  cat: string;
  catLabel: string;
  time: string;
  synced: true;
}

const CAL_MS_DAY = 24 * 60 * 60 * 1000;
const CAL_BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function calStartOfDay(d: Date | string | number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function calAddDays(d: Date | string | number, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function calStartOfWeek(d: Date | string | number): Date {
  const x = calStartOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function calISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function calTimeLabel(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

export function calEventEnd(ev: { start: Date; end?: Date; dur?: number; allDay?: boolean }): Date {
  if (ev.end) return new Date(ev.end);
  if (ev.allDay) return calAddDays(ev.start, 1);
  return new Date(ev.start.getTime() + (ev.dur || 30) * 60000);
}

// Recurrence expansion ported faithfully from calendar pure functions
const CAL_BYDAY_PARSED: Record<string, { ord: number | null; dow: number } | null> = {};
function calParseByday(code: string) {
  if (code in CAL_BYDAY_PARSED) return CAL_BYDAY_PARSED[code];
  const m = /^(-?\d+)?([A-Z]{2})$/.exec(code);
  if (!m) return (CAL_BYDAY_PARSED[code] = null);
  const dow = CAL_BYDAY.indexOf(m[2]);
  if (dow < 0) return (CAL_BYDAY_PARSED[code] = null);
  return (CAL_BYDAY_PARSED[code] = { ord: m[1] ? parseInt(m[1], 10) : null, dow });
}

function calMatchesMonthlyByday(cur: Date, code: string): boolean {
  const p = calParseByday(code);
  if (!p || cur.getDay() !== p.dow) return false;
  if (p.ord === null) return true;
  const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  if (p.ord > 0) return Math.floor((cur.getDate() - 1) / 7) + 1 === p.ord;
  return Math.floor((lastDay - cur.getDate()) / 7) + 1 === -p.ord;
}

export function expandCalEvent(ev: CalRawEvent, rangeStart: Date, rangeEnd: Date): CalRawEvent[] {
  if (!ev.rrule) {
    if (calEventEnd(ev) >= rangeStart && rangeEnd > ev.start) return [ev];
    return [];
  }
  const r = ev.rrule;
  const out: CalRawEvent[] = [];
  const exdates = new Set(r.exdates || []);
  const interval = Math.max(1, r.interval || 1);
  const until = r.until ? new Date(r.until) : null;
  const dur = ev.dur || 60;
  const seriesStart = calStartOfDay(ev.start);
  let cur = calStartOfDay(rangeStart < seriesStart ? seriesStart : rangeStart);
  const stop = until && until < rangeEnd ? calAddDays(calStartOfDay(until), 1) : rangeEnd;
  let produced = 0;
  let safety = 1000;
  const cap = r.count || 9999;

  while (cur < stop && produced < cap && safety-- > 0) {
    let include = false;
    if (r.freq === 'daily') {
      const diff = Math.floor((cur.getTime() - seriesStart.getTime()) / CAL_MS_DAY);
      include = diff >= 0 && diff % interval === 0;
    } else if (r.freq === 'weekly') {
      const weeks = Math.floor(
        (calStartOfWeek(cur).getTime() - calStartOfWeek(seriesStart).getTime()) / (7 * CAL_MS_DAY),
      );
      if (weeks >= 0 && weeks % interval === 0) {
        include = r.byday && r.byday.length
          ? r.byday.includes(CAL_BYDAY[cur.getDay()])
          : cur.getDay() === seriesStart.getDay();
      }
    } else if (r.freq === 'monthly') {
      const months =
        (cur.getFullYear() - seriesStart.getFullYear()) * 12 +
        (cur.getMonth() - seriesStart.getMonth());
      if (months >= 0 && months % interval === 0) {
        if (r.byday && r.byday.length) {
          include = r.byday.some((c) => calMatchesMonthlyByday(cur, c));
        } else {
          const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
          include = cur.getDate() === Math.min(seriesStart.getDate(), lastDay);
        }
      }
    } else if (r.freq === 'yearly') {
      const years = cur.getFullYear() - seriesStart.getFullYear();
      if (years >= 0 && years % interval === 0 && cur.getMonth() === seriesStart.getMonth()) {
        const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        include = cur.getDate() === Math.min(seriesStart.getDate(), lastDay);
      }
    }

    if (include) {
      const iso = calISO(cur);
      if (!exdates.has(iso)) {
        const inst = new Date(cur);
        inst.setHours(ev.start.getHours(), ev.start.getMinutes(), 0, 0);
        out.push({
          ...ev,
          id: `${ev.id}#${iso}`,
          start: inst,
          dur,
          __seriesId: ev.id,
          __instanceDate: iso,
        });
        produced++;
      }
    }
    cur = calAddDays(cur, 1);
  }
  return out;
}

export function expandCalEvents(events: CalRawEvent[], from: Date, to: Date): CalRawEvent[] {
  const out: CalRawEvent[] = [];
  for (const ev of events) {
    for (const inst of expandCalEvent(ev, from, to)) {
      out.push(inst);
    }
  }
  return out;
}

// ── Feed toggle store ──
export const CAL_SYNC_LS = 'cisa.calsync.v1';
export const CalFeed = (() => {
  const subs = new Set<() => void>();
  let on = (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(CAL_SYNC_LS) : null;
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  })();
  const notify = () => subs.forEach((f) => f());
  return {
    enabled: () => on,
    setEnabled(v: boolean) {
      on = !!v;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CAL_SYNC_LS, on ? '1' : '0');
        }
      } catch {}
      notify();
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
})();

// ── Category mapping store ──
export const CALMAP_LS = 'cisa.calmap.v1';
export const CALMAP_SEED: Record<string, string | null> = {
  social: 'Special',
  workshop: 'Small Group',
};

export const CalMap = (() => {
  const subs = new Set<() => void>();
  let map: Record<string, string | null> = (() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const item = localStorage.getItem(CALMAP_LS);
        return item ? { ...CALMAP_SEED, ...JSON.parse(item) } : { ...CALMAP_SEED };
      }
      return { ...CALMAP_SEED };
    } catch {
      return { ...CALMAP_SEED };
    }
  })();

  const save = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CALMAP_LS, JSON.stringify(map));
      }
    } catch {}
    subs.forEach((f) => f());
  };

  return {
    all: () => ({ ...map }),
    kindFor: (cat: string) => map[cat] || null,
    set(cat: string, kind: string | null) {
      map = { ...map, [cat]: kind || null };
      save();
    },
    reset() {
      map = { ...CALMAP_SEED };
      save();
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
})();

// Staff first name matcher for travel events
export function calAwayWho(
  ev: { title?: string; notes?: string },
  staffList: Array<{ name: string; id?: string }>,
): { name: string; id?: string } | null {
  const hay = `${ev.title || ''} ${ev.notes || ''}`.toLowerCase();
  return (
    staffList.find((s) => {
      const firstName = (s.name || '').split(' ')[0].toLowerCase();
      return firstName.length >= 2 && hay.includes(firstName);
    }) || null
  );
}

export function calItemsBetween(
  events: CalRawEvent[],
  from: Date,
  to: Date,
  categoryMap: Record<string, string | null> = CalMap.all(),
  staffList: Array<{ name: string; id?: string }> = [],
): {
  gatherings: CalGatheringItem[];
  away: CalAwayItem[];
  context: CalContextItem[];
} {
  const gatherings: CalGatheringItem[] = [];
  const away: CalAwayItem[] = [];
  const context: CalContextItem[] = [];

  const expanded = expandCalEvents(events, from, to).sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  for (const ev of expanded) {
    const kind = categoryMap[ev.cat];
    if (kind) {
      gatherings.push({
        id: ev.id,
        title: ev.title,
        type: kind,
        date: ev.start,
        time: ev.allDay ? 'All day' : calTimeLabel(ev.start),
        location: ev.loc || '',
        attended: [],
        synced: true,
        cat: ev.cat,
        seriesId: ev.__seriesId || ev.id,
      });
    } else if (ev.cat === 'travel') {
      const who = calAwayWho(ev, staffList);
      away.push({
        id: ev.id,
        who,
        title: ev.title,
        from: ev.start,
        to: calEventEnd(ev),
        synced: true,
      });
    } else {
      context.push({
        id: ev.id,
        title: ev.title,
        date: ev.start,
        to: calEventEnd(ev),
        allDay: !!ev.allDay,
        cat: ev.cat,
        catLabel: (CAL_CAT_BY_ID[ev.cat] || {}).label || ev.cat,
        time: ev.allDay ? 'All day' : calTimeLabel(ev.start),
        synced: true,
      });
    }
  }

  return { gatherings, away, context };
}

export interface UnifiedGathering {
  id: string;
  name?: string;
  title: string;
  type: string;
  date: string | Date;
  time?: string;
  location?: string;
  attended?: string[];
  synced: boolean;
  cat?: string;
  seriesId?: string;
}

export function calGatheringsMerged(
  ownEvents: Array<{ id: string; name?: string; title?: string; type?: string; date: string | Date; location?: string; attended?: string[]; time?: string }>,
  calendarEvents: CalRawEvent[],
  from: Date,
  to: Date,
  categoryMap: Record<string, string | null> = CalMap.all(),
): UnifiedGathering[] {
  const own: UnifiedGathering[] = (ownEvents || [])
    .filter((e) => {
      const d = new Date(e.date);
      return d >= from && to > d;
    })
    .map((e) => ({
      ...e,
      type: e.type || '',
      title: e.name || e.title || '',
      date: new Date(e.date),
      synced: false,
    }));

  const cal: UnifiedGathering[] = calItemsBetween(calendarEvents, from, to, categoryMap).gatherings.map((g) => ({
    ...g,
    name: g.title,
  }));

  return own.concat(cal).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function calAwaySentence(away: CalAwayItem[]): string {
  if (!away.length) return '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const span = (a: CalAwayItem) => {
    const last = calAddDays(a.to, -1);
    return calISO(a.from) === calISO(last)
      ? dow[a.from.getDay()]
      : `${dow[a.from.getDay()]}–${dow[last.getDay()]}`;
  };

  const parts = away.map(
    (a) => `${a.who ? a.who.name.split(' ')[0] : a.title} is away ${span(a)}`,
  );
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
}

export const canSeeCalendarSync = (role?: string | null): boolean =>
  role === 'admin' || role === 'manager' || role === 'owner' || role === 'ft';

export const CAL_APP_URL = 'https://shared-calendar-6u6.pages.dev/';

// ── Resilient Firestore subscription (no crash or console spam on permission denial) ──
export function subscribeLiveCalendarEvents(
  onEvents: (events: CalRawEvent[]) => void,
): () => void {
  try {
    if (!calDb) {
      onEvents([]);
      return () => {};
    }
    const unsub = onSnapshot(
      collection(calDb, 'events'),
      (snapshot) => {
        const list: CalRawEvent[] = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          const start = d.start?.toDate ? d.start.toDate() : d.start ? new Date(d.start) : new Date();
          const end = d.end?.toDate ? d.end.toDate() : d.end ? new Date(d.end) : undefined;
          list.push({
            id: doc.id,
            title: d.title || '',
            cat: d.cat || 'meeting',
            start,
            end,
            dur: d.dur,
            allDay: !!d.allDay,
            loc: d.loc || '',
            notes: d.notes || '',
            rrule: d.rrule,
          });
        });
        onEvents(list);
      },
      () => {
        // Handle unauthenticated / permission denied silently and return empty list
        onEvents([]);
      },
    );
    return unsub;
  } catch {
    onEvents([]);
    return () => {};
  }
}

// ── Hook for reactive calendar sync ──
export function useCalendarSync(staffList: Array<{ name: string; id?: string }> = []) {
  const [enabled, setEnabledState] = useState(CalFeed.enabled());
  const [categoryMap, setCategoryMap] = useState(CalMap.all());
  const [rawEvents, setRawEvents] = useState<CalRawEvent[]>([]);

  useEffect(() => {
    const unsubFeed = CalFeed.subscribe(() => setEnabledState(CalFeed.enabled()));
    const unsubMap = CalMap.subscribe(() => setCategoryMap(CalMap.all()));
    const unsubEvents = subscribeLiveCalendarEvents((evs) => setRawEvents(evs));

    return () => {
      unsubFeed();
      unsubMap();
      unsubEvents();
    };
  }, []);

  const activeEvents = enabled ? rawEvents : [];

  return {
    enabled,
    isEnabled: enabled,
    categoryMap,
    calMap: categoryMap,
    rawEvents: activeEvents,
    setEnabled: (v: boolean) => CalFeed.setEnabled(v),
    setCategoryKind: (cat: string, kind: string | null) => CalMap.set(cat, kind),
    setMapCategory: (cat: string, kind: string | null) => CalMap.set(cat, kind),
    getItemsBetween: (from: Date, to: Date) =>
      calItemsBetween(activeEvents, from, to, categoryMap, staffList),
    getMergedGatherings: (
      ownEvents: Array<{ id: string; name?: string; title?: string; type?: string; date: string | Date; location?: string; attended?: string[]; time?: string }>,
      from: Date,
      to: Date,
    ): UnifiedGathering[] => {
      if (enabled) {
        return calGatheringsMerged(ownEvents, activeEvents, from, to, categoryMap);
      }
      return (ownEvents || [])
        .filter((e) => {
          const d = new Date(e.date);
          return d >= from && to > d;
        })
        .map((e) => ({
          ...e,
          type: e.type || '',
          title: e.name || e.title || '',
          date: new Date(e.date),
          synced: false,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
    getAwaySentence: (from: Date, to: Date) =>
      enabled ? calAwaySentence(calItemsBetween(activeEvents, from, to, categoryMap, staffList).away) : '',
  };
}
