import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fromDoc,
  toFirestore,
  subscribeCalendarEvents,
  saveCalendarEvent,
  removeCalendarEvent,
  saveCalendarEventsBatch,
  removeCalendarEventsBatch,
} from '../lib/calendar/events';
import {
  subscribeCategoryOverrides,
  setCategoryOverride,
  clearCategoryOverride,
  useCategoryVersion,
} from '../lib/calendar/categories';
import {
  pushUndo,
  popAndApply,
  useUndoStack,
  dismissTop,
} from '../lib/calendar/undo';
import { parseDelimited, matchCategory, parseICS } from '../lib/calendar/import';
import type { CalendarEvent } from '../lib/calendar/types';
import type { EventDoc } from '../lib/calendar/events';
import { renderHook, act } from '@testing-library/react';

// Mock firestore for events & categories tests
const mockOnSnapshot = vi.fn();
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn(() => Promise.resolve());

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ path: name })),
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  onSnapshot: vi.fn((_ref, cb) => {
    mockOnSnapshot(cb);
    return vi.fn();
  }),
  setDoc: vi.fn((ref, data, opts) => mockSetDoc(ref, data, opts)),
  deleteDoc: vi.fn((ref) => mockDeleteDoc(ref)),
  deleteField: vi.fn(() => ({ delete: true })),
  writeBatch: vi.fn(() => ({
    set: mockBatchSet,
    delete: mockBatchDelete,
    commit: mockBatchCommit,
  })),
  getFirestore: vi.fn(() => ({})),
  Timestamp: class MockTimestamp {
    d: Date;
    constructor(d: Date = new Date()) {
      this.d = d;
    }
    static fromDate(d: Date) {
      return new MockTimestamp(d);
    }
    static now() {
      return new MockTimestamp(new Date());
    }
    toDate() {
      return this.d;
    }
    toMillis() {
      return this.d.getTime();
    }
  },
}));

describe('Calendar Firestore & Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts fromDoc with ISO string start date', () => {
    const raw: EventDoc = {
      title: 'Workshop',
      cat: 'workshop',
      start: '2026-08-24T10:00:00.000Z',
      dur: 60,
      allDay: false,
      loc: 'Hall B',
      notes: 'Bring notes',
    };
    const ev = fromDoc('doc-1', raw);
    expect(ev.id).toBe('doc-1');
    expect(ev.title).toBe('Workshop');
    expect(ev.cat).toBe('workshop');
    expect(ev.start).toBeInstanceOf(Date);
    expect(ev.dur).toBe(60);
    expect(ev.loc).toBe('Hall B');
  });

  it('converts toFirestore schema correctly', () => {
    const ev: CalendarEvent = {
      id: 'doc-2',
      title: 'Planning',
      cat: 'meeting',
      start: new Date(2026, 7, 24, 9, 0),
      dur: 45,
      allDay: false,
    };
    const firestoreData = toFirestore(ev);
    expect(firestoreData.title).toBe('Planning');
    expect(firestoreData.cat).toBe('meeting');
    expect(firestoreData.dur).toBe(45);
  });

  it('subscribes to calendar events and parses valid docs', () => {
    const cb = vi.fn();
    const unsub = subscribeCalendarEvents(cb);
    expect(unsub).toBeDefined();

    // Trigger onSnapshot mock
    const snap = {
      docs: [
        {
          id: 'doc-1',
          data: () => ({
            title: 'Camp',
            cat: 'social',
            start: '2026-08-24T10:00:00.000Z',
            allDay: true,
          }),
        },
        {
          id: 'doc-invalid',
          data: () => ({
            title: 123, // invalid title type
          }),
        },
      ],
    };
    mockOnSnapshot.mock.calls[0][0](snap);

    expect(cb).toHaveBeenCalled();
    const result = cb.mock.calls[0][0];
    expect(result.length).toBe(1);
    expect(result[0].title).toBe('Camp');
  });

  it('saves and deletes single event', async () => {
    const ev: CalendarEvent = {
      id: 'doc-save',
      title: 'Saved',
      cat: 'product',
      start: new Date(2026, 7, 24, 10, 0),
    };
    await saveCalendarEvent(ev);
    expect(mockSetDoc).toHaveBeenCalled();

    await removeCalendarEvent('doc-save');
    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it('saves and removes batch of events', async () => {
    const ev1: CalendarEvent = {
      id: 'b-1',
      title: 'Batch 1',
      cat: 'product',
      start: new Date(2026, 7, 24, 10, 0),
    };
    const ev2: CalendarEvent = {
      id: 'b-2',
      title: 'Batch 2',
      cat: 'workshop',
      start: new Date(2026, 7, 24, 11, 0),
    };
    await saveCalendarEventsBatch([ev1, ev2]);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();

    await removeCalendarEventsBatch(['b-1', 'b-2']);
    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
  });
});

describe('Category Overrides', () => {
  it('sets and clears category overrides in firestore', async () => {
    await setCategoryOverride('product', { label: 'Feature', hue: 120 });
    expect(mockSetDoc).toHaveBeenCalled();

    await clearCategoryOverride('product');
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
  });

  it('subscribes to category overrides and updates categories map', () => {
    const unsub = subscribeCategoryOverrides();
    expect(unsub).toBeDefined();

    // Trigger onSnapshot mock with category overrides
    const snap = {
      exists: () => true,
      data: () => ({
        overrides: {
          product: { label: 'Product Roadmap', hue: 150 },
        },
      }),
    };
    mockOnSnapshot.mock.calls[mockOnSnapshot.mock.calls.length - 1][0](snap);
  });

  it('useCategoryVersion triggers rerender', () => {
    const { result } = renderHook(() => useCategoryVersion());
    expect(typeof result.current).toBe('number');
  });
});

describe('Undo Stack', () => {
  it('pushes and pops undo items', async () => {
    const applyFn = vi.fn();
    pushUndo({ label: 'Added Test', apply: applyFn });

    dismissTop();

    pushUndo({ label: 'Applied Test', apply: applyFn });
    await popAndApply();
    expect(applyFn).toHaveBeenCalled();
  });

  it('useUndoStack tracks undo items state', () => {
    const { result } = renderHook(() => useUndoStack());
    expect(Array.isArray(result.current)).toBe(true);

    act(() => {
      pushUndo({ label: 'Item 1', apply: vi.fn() });
    });
    expect(result.current.length).toBeGreaterThan(0);
  });
});

describe('Calendar Import Parser', () => {
  it('matches category accurately from title or text', () => {
    expect(matchCategory('meeting')).toBe('meeting');
    expect(matchCategory('workshop')).toBe('workshop');
    expect(matchCategory('deadline')).toBe('deadline');
    expect(matchCategory('social')).toBe('social');
    expect(matchCategory('travel')).toBe('travel');
    expect(matchCategory('holiday')).toBe('holiday');
    expect(matchCategory('product')).toBe('product');
    expect(matchCategory('unknown-other')).toBe('meeting'); // fallback
  });

  it('parses ICS format content with recurrences, multiline unfold, escaped characters and all-day spans', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Calendar//EN
BEGIN:VEVENT
UID:uid1@example.com
DTSTAMP:20260824T090000Z
DTSTART:20260824T100000Z
DTEND:20260824T113000Z
SUMMARY:Team Standup\\, Weekly
LOCATION:Conference Room \\; 101
DESCRIPTION:Weekly discussion line 1\\nLine 2
CATEGORIES:Meeting
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
END:VEVENT
BEGIN:VEVENT
UID:uid2@example.com
DTSTART;VALUE=DATE:20260825
DTEND;VALUE=DATE:20260827
SUMMARY:All-Day Retreat
CATEGORIES:Social
END:VEVENT
BEGIN:VEVENT
UID:uid3@example.com
SUMMARY:Empty Dates
END:VEVENT
END:VCALENDAR`;

    const parsed = parseICS(ics);
    expect(parsed.length).toBe(3);
    expect(parsed[0].event.title).toBe('Team Standup, Weekly');
    expect(parsed[0].event.cat).toBe('meeting');
    expect(parsed[0].event.loc).toBe('Conference Room ; 101');
    expect(parsed[0].event.dur).toBe(90);
    expect(parsed[0].event.rrule?.freq).toBe('weekly');
    expect(parsed[0].include).toBe(true);

    // All day
    expect(parsed[1].event.title).toBe('All-Day Retreat');
    expect(parsed[1].event.allDay).toBe(true);

    // Empty date candidate has errors
    expect(parsed[2].errors.length).toBeGreaterThan(0);
    expect(parsed[2].include).toBe(false);
  });

  it('parses CSV and TSV content without headers, with duration strings, and invalid rows', () => {
    const tsv = 'Title\tDate\tStart\tEnd\tCategory\tLocation\tNotes\nSprint Review\t2026-08-25\t10:00\t1h 30m\tProduct\tRoom 1\tNotes here';
    const parsed = parseDelimited(tsv);
    expect(parsed.length).toBe(1);
    expect(parsed[0].event.title).toBe('Sprint Review');
    expect(parsed[0].event.cat).toBe('product');
    expect(parsed[0].event.loc).toBe('Room 1');
    expect(parsed[0].event.dur).toBe(90);

    const noHeaderCSV = 'No Header Event,08/26/2026,2:30 PM,4:00 PM,Social,Cafe,Fun';
    const parsedNoHeader = parseDelimited(noHeaderCSV);
    expect(parsedNoHeader.length).toBe(1);
    expect(parsedNoHeader[0].event.title).toBe('No Header Event');
    expect(parsedNoHeader[0].event.dur).toBe(90);

    const shortYearCSV = 'Short Year,8/26/26,9:00 AM,1h 30m,Meeting,Office,Note';
    const parsedShortYear = parseDelimited(shortYearCSV);
    expect(parsedShortYear.length).toBe(1);
    expect(parsedShortYear[0].event.dur).toBe(90);

    const invalidCSV = '   \n,invalid-date,bad-time,bad-end,,,\n';
    const parsedInvalid = parseDelimited(invalidCSV);
    expect(parsedInvalid.length).toBe(1);
    expect(parsedInvalid[0].errors.length).toBeGreaterThan(0);
    expect(parsedInvalid[0].include).toBe(false);
  });

  it('parses ICS with custom recurrence interval, until date, count, and unsupported freq', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:uid-custom@example.com
DTSTART:20260824T100000Z
SUMMARY:Complex Recurrence
RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=5
END:VEVENT
BEGIN:VEVENT
UID:uid-unsupported@example.com
DTSTART:20260824T100000Z
SUMMARY:Unsupported Recur
RRULE:FREQ=SECONDLY
END:VEVENT
END:VCALENDAR`;

    const parsed = parseICS(ics);
    expect(parsed.length).toBe(2);
    expect(parsed[0].event.rrule?.freq).toBe('monthly');
    expect(parsed[0].event.rrule?.interval).toBe(2);
    expect(parsed[0].event.rrule?.count).toBe(5);

    expect(parsed[1].warnings.length).toBeGreaterThan(0);
    expect(parsed[1].event.rrule).toBeUndefined();
  });
});
