import { describe, it, expect } from 'vitest';
import {
  getSessionRoster,
  calculateMissedContacts,
  shouldCountSessionForContact,
  resolveRoster,
  cycleAttendanceStatus,
  applyAttendance,
  cancelGathering,
  uncancelGathering,
  heldGatherings,
  averageAttendance,
  localDay,
} from '../lib/attendanceRoster';
import type { Contact, Gathering, Rhythm } from '../types';

const NOW = new Date('2026-09-09T14:00:00');

describe('attendanceRoster', () => {
  const contactA: Contact = {
    id: 'c1',
    name: 'Alice',
    location: 'Campus',
    email: 'alice@example.com',
    phone: '123',
    stage: 'Believer',
    lastSeen: '2026-06-01',
    initials: 'A',
  };

  const contactB: Contact = {
    id: 'c2',
    name: 'Bob',
    location: 'Campus',
    email: 'bob@example.com',
    phone: '456',
    stage: 'Seeker',
    lastSeen: '2026-05-01',
    initials: 'B',
  };

  const contactC: Contact = {
    id: 'c3',
    name: 'Charlie',
    location: 'Campus',
    email: 'charlie@example.com',
    phone: '789',
    stage: 'Community',
    lastSeen: '2026-04-01',
    initials: 'C',
  };

  const event1: Gathering = {
    id: 'e1',
    name: 'Friday Gathering',
    date: '2026-06-12',
    order: 1,
    createdAt: '2026-06-01',
    roster: ['c1'], // only Alice is on the roster
    attendance: { present: ['c1', 'c2'], absent: [] },
  };

  const event2: Gathering = {
    id: 'e2',
    name: 'Friday Gathering 2',
    date: '2026-06-05',
    order: 2,
    createdAt: '2026-05-25',
    roster: ['c1', 'c2'], // Alice & Bob on roster
    attendance: { present: [], absent: ['c1'] },
  };

  describe('getSessionRoster', () => {
    it('returns present, absent, and available contacts correctly bounded by roster', () => {
      const contacts = [contactA, contactB, contactC];
      const { present, absent, nonRoster } = getSessionRoster(event1, contacts);

      expect(present.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(absent.map((c) => c.id)).toEqual([]);
      expect(nonRoster.map((c) => c.id)).toEqual(['c3']);
    });

    it('identifies un-attended roster members as absent', () => {
      const contacts = [contactA, contactB, contactC];
      const { present, absent } = getSessionRoster(event2, contacts);

      expect(present).toHaveLength(0);
      expect(absent.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    });

    it('orders present and absent roster-first, then outside the roster, each alphabetical', () => {
      const mk = (id: string, name: string): Contact => ({ ...contactA, id, name });
      const contacts = [
        mk('p-walk-z', 'zed walk'),
        mk('p-roster-b', 'bea'),
        mk('p-walk-a', 'Adam walk'),
        mk('p-roster-a', 'Aaron'),
        mk('p-roster-c', 'carl'),
        mk('a-walk-b', 'beth walk'),
        mk('a-roster-b', 'Bob'),
        mk('a-walk-a', 'Amy walk'),
        mk('a-roster-a', 'alex'),
      ];
      const gathering: Gathering = {
        id: 'e9',
        name: 'Order check',
        date: '2026-06-12',
        order: 1,
        createdAt: '2026-05-25',
        roster: ['p-roster-a', 'p-roster-b', 'p-roster-c', 'a-roster-a', 'a-roster-b'],
        attendance: {
          present: ['p-walk-z', 'p-roster-b', 'p-walk-a', 'p-roster-a', 'p-roster-c'],
          absent: ['a-walk-b', 'a-walk-a'],
        },
      };
      const { present, absent, nonRoster } = getSessionRoster(gathering, contacts);
      expect(present.map((c) => c.name)).toEqual(['Aaron', 'bea', 'carl', 'Adam walk', 'zed walk']);
      expect(absent.map((c) => c.name)).toEqual(['alex', 'Bob']);
      expect(nonRoster.map((c) => c.name).sort()).toEqual(['Amy walk', 'beth walk']);
    });

    it('treats an explicit absence for someone off the roster as no mark', () => {
      const gathering: Gathering = {
        id: 'e10',
        name: 'Walk-in absence',
        date: '2026-06-12',
        order: 1,
        createdAt: '',
        roster: ['c1'],
        attendance: { present: ['c2'], absent: ['c3'] },
      };
      const { present, absent, nonRoster } = getSessionRoster(gathering, [contactA, contactB, contactC]);
      expect(present.map((c) => c.id)).toEqual(['c2']);
      expect(absent.map((c) => c.id)).toEqual(['c1']);
      expect(nonRoster.map((c) => c.id)).toEqual(['c3']);
    });

    it('counts nobody absent for a cancelled Gathering', () => {
      const cancelled: Gathering = { ...event2, cancelled: true };
      const { absent, nonRoster } = getSessionRoster(cancelled, [contactA, contactB, contactC]);
      expect(absent).toHaveLength(0);
      expect(nonRoster.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3']);
    });
  });

  describe('cycleAttendanceStatus', () => {
    it('cycles a roster member present -> absent -> present', () => {
      expect(cycleAttendanceStatus('present', true)).toBe('absent');
      expect(cycleAttendanceStatus('absent', true)).toBe('present');
      expect(cycleAttendanceStatus(undefined, true)).toBe('present');
    });

    it('clears a walk-in in one tap: unmarked -> present -> unmarked, never absent (#1641)', () => {
      expect(cycleAttendanceStatus(undefined, false)).toBe('present');
      expect(cycleAttendanceStatus('present', false)).toBeUndefined();
      // A lingering off-roster absence is treated as no mark, so the next tap
      // checks them in rather than being consumed clearing it.
      expect(cycleAttendanceStatus('absent', false)).toBe('present');
    });
  });

  describe('applyAttendance', () => {
    it('clears a mark from both lists when next is undefined', () => {
      expect(applyAttendance({ present: ['c1'], absent: [] }, 'c1', undefined)).toEqual({ present: [], absent: [] });
      expect(applyAttendance({ present: [], absent: ['c1'] }, 'c1', undefined)).toEqual({ present: [], absent: [] });
    });
  });

  describe('shouldCountSessionForContact', () => {
    it('does not count a session as missed if contact had never attended and was not in roster at that time', () => {
      const countPast = shouldCountSessionForContact(contactB, event2, [event1, event2]);
      expect(countPast).toBe(true);

      const countC = shouldCountSessionForContact(contactC, event2, [event1, event2]);
      expect(countC).toBe(false);
    });

    it('does not count an explicit absence for someone off the roster', () => {
      const session: Gathering = {
        ...event2,
        roster: ['c1', 'c2'],
        attendance: { present: [], absent: ['c3'] },
      };
      expect(shouldCountSessionForContact(contactC, session, [session])).toBe(false);
    });

    it('never counts a cancelled session', () => {
      const cancelled: Gathering = { ...event2, cancelled: true };
      expect(shouldCountSessionForContact(contactA, cancelled, [event1, cancelled])).toBe(false);
    });
  });

  describe('calculateMissedContacts', () => {
    it('only tracks contacts who were in roster or previously attended, excluding random non-attendees', () => {
      const contacts = [contactA, contactB, contactC];
      const sessions = [event1, event2]; // e1 is newest, e2 is older

      const missed = calculateMissedContacts(contacts, sessions);
      const contactIds = missed.map((m) => m.contact.id);

      expect(contactIds).not.toContain('c3');
    });

    it('excludes cancelled Gatherings from the scan entirely', () => {
      const cancelledNewest: Gathering = { ...event1, id: 'e0', date: '2026-06-19', cancelled: true };
      const missed = calculateMissedContacts([contactA], [cancelledNewest, event1, event2]);
      // Contact A attended e1 — cancelled e0 must not shift "since" or lastSeen.
      expect(missed.find((m) => m.contact.id === 'c1')?.lastSeen.id).not.toBe('e0');
    });
  });

  describe('resolveRoster', () => {
    const rhythm: Rhythm = {
      id: 'r1',
      name: 'Wednesday Bible Study',
      cadence: { type: 'weekly', days: [3] },
      roster: ['c1', 'c2'],
      termStart: '2026-09-09',
      termEnd: '2026-12-23',
      createdAt: '2026-09-01T00:00:00Z',
      createdById: 'u1',
    };

    it('resolves live from rhythm.roster for a current/future occasion', () => {
      const occasion: Gathering = { id: 'o1', name: 'x', date: '2026-09-09', order: 0, createdAt: '', rhythmId: 'r1' };
      expect(resolveRoster(occasion, rhythm, NOW)).toEqual(['c1', 'c2']);
    });

    it('applies the occasion override on top of the rhythm roster for a live occasion', () => {
      const occasion: Gathering = {
        id: 'o1', name: 'x', date: '2026-09-09', order: 0, createdAt: '', rhythmId: 'r1',
        rosterOverride: ['c1', 'c3'],
      };
      expect(resolveRoster(occasion, rhythm, NOW)).toEqual(['c1', 'c3']);
    });

    it('freezes to the recorded roster for a past occasion, ignoring the rhythm roster as it stands today', () => {
      const occasion: Gathering = {
        id: 'o1', name: 'x', date: '2026-09-02', order: 0, createdAt: '', rhythmId: 'r1',
        roster: ['c1'],
      };
      expect(resolveRoster(occasion, rhythm, NOW)).toEqual(['c1']);
    });

    it('returns its own roster for a one-off (no rhythmId)', () => {
      const oneOff: Gathering = { id: 'o1', name: 'x', date: '2026-09-09', order: 0, createdAt: '', roster: ['c5'] };
      expect(resolveRoster(oneOff, undefined, NOW)).toEqual(['c5']);
    });
  });

  describe('cancelGathering / uncancelGathering', () => {
    it('marks and unmarks cancelled', () => {
      const g: Gathering = { id: 'g1', name: 'x', date: '2026-09-09', order: 0, createdAt: '' };
      const cancelled = cancelGathering(g);
      expect(cancelled.cancelled).toBe(true);
      const restored = uncancelGathering(cancelled);
      expect(restored.cancelled).toBeUndefined();
    });
  });
});

describe('resolveRoster - live overrides rebase against later Rhythm changes (story 5)', () => {
  const rhythm: Rhythm = {
    id: 'r1',
    name: 'Wednesday Bible Study',
    cadence: { type: 'weekly', days: [3] },
    roster: ['c1', 'c2'],
    termStart: '2026-09-09',
    termEnd: '2026-12-23',
    createdAt: '2026-09-01T00:00:00Z',
    createdById: 'u1',
  };
  const NOW = new Date('2026-09-09T14:00:00');

  it('keeps a one-week addition when the Rhythm gains a new regular later', () => {
    const occasion: Gathering = {
      id: 'o1',
      name: 'Wednesday Bible Study',
      date: '2026-09-16',
      order: 0,
      createdAt: '',
      rhythmId: 'r1',
      rosterOverride: ['c1', 'c2', 'c3'],
      rosterOverrideBase: ['c1', 'c2'],
    };
    const grown: Rhythm = { ...rhythm, roster: ['c1', 'c2', 'c4'] };
    expect(resolveRoster(occasion, grown, NOW)).toEqual(['c1', 'c2', 'c4', 'c3']);
  });

  it('keeps a one-week removal when the Rhythm gains a new regular later', () => {
    const occasion: Gathering = {
      id: 'o1',
      name: 'Wednesday Bible Study',
      date: '2026-09-16',
      order: 0,
      createdAt: '',
      rhythmId: 'r1',
      rosterOverride: ['c2'],
      rosterOverrideBase: ['c1', 'c2'],
    };
    const grown: Rhythm = { ...rhythm, roster: ['c1', 'c2', 'c4'] };
    expect(resolveRoster(occasion, grown, NOW)).toEqual(['c2', 'c4']);
  });

  it('freezes a past occasion with a recorded roster when the Rhythm changes', () => {
    const occasion: Gathering = {
      id: 'o1',
      name: 'Wednesday Bible Study',
      date: '2026-09-02',
      order: 0,
      createdAt: '',
      rhythmId: 'r1',
      roster: ['c1'],
    };
    const changed: Rhythm = { ...rhythm, roster: ['c9'] };
    expect(resolveRoster(occasion, changed, NOW)).toEqual(['c1']);
  });

  it('freezes a past occasion with an override when the Rhythm changes', () => {
    const occasion: Gathering = {
      id: 'o1',
      name: 'Wednesday Bible Study',
      date: '2026-09-02',
      order: 0,
      createdAt: '',
      rhythmId: 'r1',
      rosterOverride: ['c1', 'c3'],
      rosterOverrideBase: ['c1', 'c2'],
    };
    const changed: Rhythm = { ...rhythm, roster: ['c9'] };
    expect(resolveRoster(occasion, changed, NOW)).toEqual(['c1', 'c3']);
  });
});

// The season figures and the phone's date column (#1769): a page that says
// "we've come together N times" must not count a week that has not happened or
// one that was called off, and a date-only gathering is a LOCAL day.
describe('heldGatherings and averageAttendance (#1769)', () => {
  const NOW = new Date(2026, 9, 24, 9, 0, 0); // 24 Oct 2026, local morning
  const g = (id: string, date: string, present: number, cancelled = false): Gathering => ({
    id,
    name: id,
    date,
    order: 0,
    createdAt: '',
    ...(cancelled ? { cancelled: true } : {}),
    attendance: { present: Array.from({ length: present }, (_, i) => `c${i}`), absent: [] },
  });

  it('keeps a gathering dated today and drops the future', () => {
    const held = heldGatherings([g('today', '2026-10-24', 3), g('soon', '2026-10-27', 0)], NOW);
    expect(held.map((x) => x.id)).toEqual(['today']);
  });

  it('drops a cancelled week even when it is in the past', () => {
    const held = heldGatherings([g('past', '2026-10-21', 0, true), g('met', '2026-10-16', 2)], NOW);
    expect(held.map((x) => x.id)).toEqual(['met']);
  });

  it('averages only the weeks somebody recorded: an unrecorded one is unknown, not zero', () => {
    const unrecorded: Gathering = { id: 'u', name: 'u', date: '2026-10-20', order: 0, createdAt: '' };
    const all = [g('a', '2026-10-02', 6), g('b', '2026-10-09', 2), g('c', '2026-10-16', 3), g('d', '2026-10-23', 4), unrecorded, g('e', '2026-10-21', 0, true), g('f', '2026-10-27', 0)];
    const held = heldGatherings(all, NOW);
    // Five meetings happened; one of them nobody recorded.
    expect(held).toHaveLength(5);
    expect(averageAttendance(held)).toBe(4); // (6+2+3+4)/4 = 3.75
    expect(averageAttendance([])).toBe(0);
  });

  it('reads a date-only string as a local day, at noon, in any timezone', () => {
    const d = localDay('2026-09-14');
    expect(d?.getDate()).toBe(14);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getHours()).toBe(12);
    // The naive parse this replaced: UTC midnight, which is the previous day
    // anywhere west of Greenwich.
    expect(d?.getTime()).toBe(new Date(2026, 8, 14, 12).getTime());
  });

  it('passes a Date through and returns null for nothing', () => {
    const date = new Date(2026, 9, 27, 12);
    expect(localDay(date)).toBe(date);
    expect(localDay(undefined)).toBeNull();
    expect(localDay('')).toBeNull();
  });
});
