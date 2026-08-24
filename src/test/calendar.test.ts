import { describe, expect, it } from 'vitest';
import {
  expandEvent,
  expandEvents,
  isoDate,
  startOfWeek,
  monthGrid,
  getEventCalendarLabel,
  conflictMap,
  eventsOverlap,
  isConflictable,
  suggestDates,
  suggestSlots,
  rruleSummary,
  type CalendarEvent,
} from '../lib/calendar/calendar';
import { fromDoc, toFirestore } from '../lib/calendar/events';
import { matchCategory, parseDelimited } from '../lib/calendar/import';

function mk(start: Date, rrule: CalendarEvent['rrule'], opts?: Partial<CalendarEvent>): CalendarEvent {
  return { id: 'e1', title: 'Test event', cat: 'meeting', start, allDay: true, dur: 0, rrule, ...opts };
}

describe('calendar recurrence engine (expandEvent)', () => {
  it('YEARLY: emits once per year on the same month/day', () => {
    const ev = mk(new Date(2024, 2, 1), { freq: 'yearly' }); // Mar 1 2024
    const out = expandEvent(ev, new Date(2024, 0, 1), new Date(2027, 0, 1));
    expect(out.map((i) => isoDate(i.start))).toEqual(['2024-03-01', '2025-03-01', '2026-03-01']);
  });

  it('YEARLY with interval=2: every other year', () => {
    const ev = mk(new Date(2024, 2, 1), { freq: 'yearly', interval: 2 });
    const out = expandEvent(ev, new Date(2024, 0, 1), new Date(2026, 11, 1));
    expect(out.map((i) => isoDate(i.start))).toEqual(['2024-03-01', '2026-03-01']);
  });

  it('YEARLY: clamps Feb 29 to Feb 28 in non-leap years', () => {
    const ev = mk(new Date(2024, 1, 29), { freq: 'yearly' });
    const out = expandEvent(ev, new Date(2024, 0, 1), new Date(2027, 0, 1));
    expect(out.map((i) => isoDate(i.start))).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });

  it('MONTHLY+BYDAY=1SU: first Sunday of each month', () => {
    const ev = mk(new Date(2026, 0, 4), { freq: 'monthly', byday: ['1SU'] });
    const out = expandEvent(ev, new Date(2026, 0, 1), new Date(2026, 4, 1));
    expect(out.map((i) => isoDate(i.start))).toEqual(['2026-01-04', '2026-02-01', '2026-03-01', '2026-04-05']);
  });

  it('MONTHLY+BYDAY=-1FR: last Friday of each month', () => {
    const ev = mk(new Date(2026, 0, 30), { freq: 'monthly', byday: ['-1FR'] });
    const out = expandEvent(ev, new Date(2026, 0, 1), new Date(2026, 4, 1));
    expect(out.map((i) => isoDate(i.start))).toEqual(['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24']);
  });

  it('DAILY with exdates: skips excluded dates', () => {
    const ev = mk(new Date(2026, 0, 1), { freq: 'daily', exdates: ['2026-01-02', '2026-01-04'] });
    const out = expandEvent(ev, new Date(2026, 0, 1), new Date(2026, 0, 6));
    expect(out.map((i) => isoDate(i.start))).toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
  });

  it('handles non-recurring events within range', () => {
    const ev = mk(new Date(2026, 5, 10, 10, 0), undefined, { allDay: false, dur: 60 });
    const inRange = expandEvent(ev, new Date(2026, 5, 1), new Date(2026, 5, 20));
    expect(inRange).toHaveLength(1);
    const outOfRange = expandEvent(ev, new Date(2026, 6, 1), new Date(2026, 6, 20));
    expect(outOfRange).toHaveLength(0);
  });
});

describe('calendar conflict detection', () => {
  it('detects overlapping timed events', () => {
    const e1 = mk(new Date(2026, 5, 10, 10, 0), undefined, { id: 'e1', allDay: false, dur: 60 });
    const e2 = mk(new Date(2026, 5, 10, 10, 30), undefined, { id: 'e2', allDay: false, dur: 60 });
    const e3 = mk(new Date(2026, 5, 10, 12, 0), undefined, { id: 'e3', allDay: false, dur: 60 });

    expect(isConflictable(e1)).toBe(true);
    expect(eventsOverlap(e1, e2)).toBe(true);
    expect(eventsOverlap(e1, e3)).toBe(false);

    const conflicts = conflictMap([e1, e2, e3]);
    expect(conflicts.get('e1')).toBe(1);
    expect(conflicts.get('e2')).toBe(1);
    expect(conflicts.get('e3')).toBeUndefined();
  });

  it('all-day, deadline, and holiday events are not conflictable', () => {
    const allDay = mk(new Date(2026, 5, 10), undefined, { allDay: true });
    const deadline = mk(new Date(2026, 5, 10, 10, 0), undefined, { cat: 'deadline', allDay: false, dur: 60 });
    const holiday = mk(new Date(2026, 5, 10, 10, 0), undefined, { cat: 'holiday', allDay: false, dur: 60 });

    expect(isConflictable(allDay)).toBe(false);
    expect(isConflictable(deadline)).toBe(false);
    expect(isConflictable(holiday)).toBe(false);
  });
});

describe('calendar smart suggestions', () => {
  it('suggests quietest dates', () => {
    const from = new Date(2026, 5, 1);
    const busyEvent = mk(new Date(2026, 5, 2, 10, 0), undefined, { allDay: false, dur: 180 });
    const suggestions = suggestDates(from, 60, [busyEvent], 3);
    expect(suggestions.length).toBeGreaterThan(0);
    // Jun 2 should have higher busyMins than Jun 1
    const jun2 = suggestions.find((s) => isoDate(s.date) === '2026-06-02');
    if (jun2) expect(jun2.busyMins).toBeGreaterThan(0);
  });

  it('suggests free slots on a day', () => {
    const day = new Date(2026, 5, 10);
    const meeting = mk(new Date(2026, 5, 10, 9, 0), undefined, { allDay: false, dur: 60 });
    const slots = suggestSlots(day, 60, [meeting]);
    expect(slots.length).toBeGreaterThan(0);
    const slot9am = slots.find((s) => s.h === 9 && s.m === 0);
    expect(slot9am?.conflicts).toBe(1);
    const slot11am = slots.find((s) => s.h === 11 && s.m === 0);
    expect(slot11am?.conflicts).toBe(0);
  });
});

describe('startOfWeek & monthGrid defaults', () => {
  it('startOfWeek starts on Sunday by default', () => {
    const wed = new Date(2026, 6, 22);
    const start = startOfWeek(wed);
    expect(start.getDay()).toBe(0);
    expect(isoDate(start)).toBe('2026-07-19');
  });

  it('monthGrid first cell is a Sunday by default', () => {
    const grid = monthGrid(new Date(2026, 6, 1));
    expect(grid[0].getDay()).toBe(0);
    expect(grid).toHaveLength(42);
  });
});

describe('rruleSummary & getEventCalendarLabel', () => {
  it('formats rrule summary nicely', () => {
    expect(rruleSummary({ freq: 'daily' })).toBe('Repeats daily');
    expect(rruleSummary({ freq: 'weekly', byday: ['MO', 'WE'] })).toBe('Repeats weekly on Mon, Wed');
    expect(rruleSummary({ freq: 'monthly', interval: 2 })).toBe('Repeats every 2 months');
    expect(rruleSummary(undefined)).toBe('');
  });

  it('returns appropriate calendar label', () => {
    const normal = mk(new Date(), undefined);
    expect(getEventCalendarLabel(normal)).toEqual({ name: 'Shared Calendar', isGcal: false });

    const gcal = mk(new Date(), undefined, { syncOrigin: 'gcal', gcalFeedId: 'cal1' });
    expect(getEventCalendarLabel(gcal, { cal1: 'Campus Schedule' })).toEqual({
      name: 'Google Calendar (Campus Schedule)',
      isGcal: true,
    });
  });
});

describe('doc converters (fromDoc & toFirestore)', () => {
  it('converts between CalendarEvent and Firestore document data', () => {
    const ev = mk(new Date(2026, 5, 15, 14, 0), undefined, {
      id: 'doc-123',
      title: 'Staff Meeting',
      cat: 'meeting',
      allDay: false,
      dur: 45,
      loc: 'Room A',
      notes: 'Bring notes',
    });

    const firestoreData = toFirestore(ev);
    expect(firestoreData.title).toBe('Staff Meeting');
    expect(firestoreData.cat).toBe('meeting');
    expect(firestoreData.loc).toBe('Room A');

    const restored = fromDoc('doc-123', firestoreData);
    expect(restored.id).toBe('doc-123');
    expect(restored.title).toBe('Staff Meeting');
    expect(restored.cat).toBe('meeting');
    expect(restored.dur).toBe(45);
    expect(restored.start.getFullYear()).toBe(2026);
  });
});

describe('calendar import parsing (parseDelimited & matchCategory)', () => {
  it('matches categories flexibly', () => {
    expect(matchCategory('meeting')).toBe('meeting');
    expect(matchCategory('Product')).toBe('product');
    expect(matchCategory('unknown-cat')).toBe('meeting');
  });

  it('parses CSV text into import candidates', () => {
    const csv = `Title,Date,Start,End,Category,Location
Team Standup,2026-06-15,10:00 AM,11:00 AM,meeting,Main Hall
Fellowship Night,2026-06-16,,,social,Student Lounge`;

    const candidates = parseDelimited(csv);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].event.title).toBe('Team Standup');
    expect(candidates[0].event.cat).toBe('meeting');
    expect(candidates[0].event.dur).toBe(60);
    expect(candidates[1].event.title).toBe('Fellowship Night');
    expect(candidates[1].event.cat).toBe('social');
    expect(candidates[1].event.allDay).toBe(true);
  });
});
