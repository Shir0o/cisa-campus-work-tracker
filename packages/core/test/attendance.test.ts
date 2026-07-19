import { describe, it, expect } from 'vitest';
import {
  here,
  cycleAttendanceStatus,
  sessionsNewestFirst,
  whoWeMissed,
  avgAttendance,
  buildAttendanceCsv,
} from '../src/attendance';
import type { Contact, Event } from '../src/types';

const NOW = new Date('2026-07-13T12:00:00Z').getTime();
const DAY_MS = 86_400_000;

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Gathering',
  date: new Date(NOW).toISOString(),
  order: 0,
  createdAt: new Date(NOW).toISOString(),
  ...overrides,
});

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Alex',
  role: 'Student',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: '',
  initials: 'A',
  ...overrides,
});

describe('here', () => {
  it('is true for present or late, false for absent or unmarked', () => {
    const c = contact({ attendance: { present: true, late: 'late', absent: 'absent' } });
    expect(here(c, 'present')).toBe(true);
    expect(here(c, 'late')).toBe(true);
    expect(here(c, 'absent')).toBe(false);
    expect(here(c, 'unmarked')).toBe(false);
  });
});

describe('cycleAttendanceStatus', () => {
  it('cycles present -> late -> absent -> present', () => {
    expect(cycleAttendanceStatus(true)).toBe('late');
    expect(cycleAttendanceStatus('late')).toBe('absent');
    expect(cycleAttendanceStatus('absent')).toBe(true);
  });

  it('jumps unmarked straight to present', () => {
    expect(cycleAttendanceStatus(undefined)).toBe(true);
  });
});

describe('sessionsNewestFirst', () => {
  it('sorts descending by date, ties broken by order', () => {
    const events = [
      event({ id: 'earlier', date: new Date(NOW - DAY_MS).toISOString(), order: 0 }),
      event({ id: 'tie-a', date: new Date(NOW).toISOString(), order: 1 }),
      event({ id: 'tie-b', date: new Date(NOW).toISOString(), order: 2 }),
    ];
    const result = sessionsNewestFirst(events);
    expect(result.map((e) => e.id)).toEqual(['tie-b', 'tie-a', 'earlier']);
  });
});

describe('whoWeMissed', () => {
  it('includes contacts absent for 2+ of the most recent sessions who attended before', () => {
    const sessions = [
      event({ id: 's4', date: new Date(NOW).toISOString() }),
      event({ id: 's3', date: new Date(NOW - DAY_MS).toISOString() }),
      event({ id: 's2', date: new Date(NOW - 2 * DAY_MS).toISOString() }),
      event({ id: 's1', date: new Date(NOW - 3 * DAY_MS).toISOString() }),
    ];
    const missedTwice = contact({ id: 'missed-two', attendance: { s1: true } });
    const missedOnce = contact({ id: 'missed-one', attendance: { s3: true } });
    const neverCame = contact({ id: 'never', attendance: {} });

    const result = whoWeMissed([missedTwice, missedOnce, neverCame], sessions);
    expect(result.map((r) => r.contact.id)).toEqual(['missed-two']);
    expect(result[0].since).toBe(3);
    expect(result[0].lastSeen.id).toBe('s1');
  });

  it('sorts longest-absent first and caps to limit', () => {
    const sessions = [3, 2, 1, 0].map((n) =>
      event({ id: `s${n}`, date: new Date(NOW - n * DAY_MS).toISOString() }),
    );
    const contacts = ['a', 'b', 'c'].map((id, i) =>
      contact({ id, attendance: { [`s${i}`]: true } }),
    );
    const result = whoWeMissed(contacts, sessions, 2);
    expect(result).toHaveLength(2);
    expect(result[0].since).toBeGreaterThanOrEqual(result[1].since);
  });
});

describe('avgAttendance', () => {
  it('returns 0 when there are no events', () => {
    expect(avgAttendance([contact()], [])).toBe(0);
  });

  it('averages present+late slots per event', () => {
    const events = [event({ id: 'e1' }), event({ id: 'e2' })];
    const contacts = [
      contact({ id: 'a', attendance: { e1: true, e2: true } }),
      contact({ id: 'b', attendance: { e1: 'late' } }),
      contact({ id: 'c', attendance: { e1: 'absent' } }),
    ];
    // slots: a=2, b=1, c=0 -> 3 total / 2 events = 1.5 -> rounds to 2
    expect(avgAttendance(contacts, events)).toBe(2);
  });
});

describe('buildAttendanceCsv', () => {
  it('builds a quoted header row plus one quoted row per contact', () => {
    const events = [event({ id: 'e1', name: 'Bible Study', date: '2026-07-13' })];
    const contacts = [contact({ id: 'a', name: 'Alex', role: 'Student', attendance: { e1: true } })];
    const csv = buildAttendanceCsv(contacts, events);
    const [header, row] = csv.split('\n');
    expect(header).toBe('"Name","Role","Bible Study (2026-07-13)"');
    expect(row).toBe('"Alex","Student","Present"');
  });

  it('maps attendance values to Present/Late/Absent/None', () => {
    const events = [
      event({ id: 'e1' }),
      event({ id: 'e2' }),
      event({ id: 'e3' }),
      event({ id: 'e4' }),
    ];
    const c = contact({ attendance: { e1: true, e2: 'late', e3: 'absent' } });
    const csv = buildAttendanceCsv([c], events);
    const [, row] = csv.split('\n');
    expect(row).toBe('"Alex","Student","Present","Late","Absent","None"');
  });
});
