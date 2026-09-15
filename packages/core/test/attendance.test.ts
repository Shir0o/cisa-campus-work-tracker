import { describe, it, expect } from 'vitest';
import {
  isAttendanceTaken,
  here,
  explicitlyAbsent,
  presentCount,
  cycleAttendanceStatus,
  applyAttendance,
  hydrateGatherings,
  sessionsNewestFirst,
  whoWeMissed,
  avgAttendance,
  buildAttendanceCsv,
} from '../src/attendance';
import type { Contact, Event, GatheringAttendance } from '../src/types';

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

const att = (present: string[] = [], absent: string[] = []): GatheringAttendance => ({ present, absent });

describe('isAttendanceTaken', () => {
  it('is true once the record exists, even when empty', () => {
    expect(isAttendanceTaken(event())).toBe(false);
    expect(isAttendanceTaken(event({ attendance: att() }))).toBe(true);
  });
});

describe('here / explicitlyAbsent / presentCount', () => {
  it('reads presence and deliberate absence from the Gathering', () => {
    const e = event({ attendance: att(['a'], ['b']) });
    expect(here(e, 'a')).toBe(true);
    expect(here(e, 'b')).toBe(false);
    expect(explicitlyAbsent(e, 'b')).toBe(true);
    expect(explicitlyAbsent(e, 'a')).toBe(false);
    expect(presentCount(e)).toBe(1);
  });

  it('treats an unmarked occasion as nobody present and nobody absent', () => {
    const u = event();
    expect(here(u, 'a')).toBe(false);
    expect(explicitlyAbsent(u, 'a')).toBe(false);
    expect(presentCount(u)).toBe(0);
  });
});

describe('cycleAttendanceStatus', () => {
  it('cycles present -> absent -> present', () => {
    expect(cycleAttendanceStatus('present')).toBe('absent');
    expect(cycleAttendanceStatus('absent')).toBe('present');
  });

  it('jumps unmarked straight to present', () => {
    expect(cycleAttendanceStatus(undefined)).toBe('present');
  });
});

describe('applyAttendance', () => {
  it('marks an unmarked occasion and moves a contact between the lists', () => {
    expect(applyAttendance(undefined, 'a', 'present')).toEqual(att(['a']));
    expect(applyAttendance(att(['a']), 'a', 'absent')).toEqual(att([], ['a']));
    expect(applyAttendance(att([], ['a']), 'a', 'present')).toEqual(att(['a']));
  });

  it('does not disturb other contacts', () => {
    expect(applyAttendance(att(['a'], ['b']), 'c', 'present')).toEqual(att(['a', 'c'], ['b']));
  });
});

describe('hydrateGatherings', () => {
  it('derives Gathering records from legacy contact maps, folding late into present', () => {
    const legacy = contact({ id: 'old', attendance: { e1: true, e2: 'late', e3: 'absent' } } as Partial<Contact>);
    const events = [event({ id: 'e1' }), event({ id: 'e2' }), event({ id: 'e3' }), event({ id: 'e4' })];
    const out = hydrateGatherings(events, [legacy]);
    expect(out[0].attendance).toEqual(att(['old']));
    expect(out[1].attendance).toEqual(att(['old']));
    expect(out[2].attendance).toEqual(att([], ['old']));
    expect(out[3].attendance).toBeUndefined();
  });

  it('turns a stamp-only Gathering into an empty record', () => {
    const stamped = event({ attendanceTakenAt: '2026-07-13T00:00:00.000Z' } as Partial<Event>);
    expect(hydrateGatherings([stamped], [])[0].attendance).toEqual(att());
  });

  it('leaves an already-owned record untouched', () => {
    const owned = event({ attendance: att(['x']) });
    expect(hydrateGatherings([owned], [])[0]).toBe(owned);
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
      event({ id: 's3', date: new Date(NOW - DAY_MS).toISOString(), attendance: att(['missed-one']) }),
      event({ id: 's2', date: new Date(NOW - 2 * DAY_MS).toISOString() }),
      event({ id: 's1', date: new Date(NOW - 3 * DAY_MS).toISOString(), attendance: att(['missed-two']) }),
    ];
    const missedTwice = contact({ id: 'missed-two' });
    const missedOnce = contact({ id: 'missed-one' });
    const neverCame = contact({ id: 'never' });

    const result = whoWeMissed([missedTwice, missedOnce, neverCame], sessions);
    expect(result.map((r) => r.contact.id)).toEqual(['missed-two']);
    expect(result[0].since).toBe(3);
    expect(result[0].lastSeen.id).toBe('s1');
  });

  it('sorts longest-absent first and caps to limit', () => {
    const sessions = [3, 2, 1, 0].map((n) =>
      event({ id: `s${n}`, date: new Date(NOW - n * DAY_MS).toISOString() }),
    );
    const contacts = ['a', 'b', 'c'].map((id, i) => contact({ id }));
    sessions[3 - 0] = event({ id: 's0', attendance: att(['a']) });
    const result = whoWeMissed(contacts, sessions, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe('avgAttendance', () => {
  it('returns 0 when there are no events', () => {
    expect(avgAttendance([])).toBe(0);
  });

  it('averages present slots per event', () => {
    const events = [
      event({ id: 'e1', attendance: att(['a', 'b'], ['c']) }),
      event({ id: 'e2', attendance: att(['a']) }),
    ];
    expect(avgAttendance(events)).toBe(2);
  });
});

describe('buildAttendanceCsv', () => {
  it('builds a quoted header row plus one quoted row per contact', () => {
    const events = [event({ id: 'e1', name: 'Bible Study', date: '2026-07-13', attendance: att(['a']) })];
    const contacts = [contact({ id: 'a', name: 'Alex', role: 'Student' })];
    const csv = buildAttendanceCsv(contacts, events);
    const [header, row] = csv.split('\n');
    expect(header).toBe('"Name","Role","Bible Study (2026-07-13)"');
    expect(row).toBe('"Alex","Student","Present"');
  });

  it('maps present/absent/unmarked to Present/Absent/None', () => {
    const events = [
      event({ id: 'e1', attendance: att(['a']) }),
      event({ id: 'e2', attendance: att([], ['a']) }),
      event({ id: 'e3' }),
    ];
    const csv = buildAttendanceCsv([contact({ id: 'a' })], events);
    const [, row] = csv.split('\n');
    expect(row).toBe('"Alex","Student","Present","Absent","None"');
  });
});
