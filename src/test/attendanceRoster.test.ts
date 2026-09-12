import { describe, it, expect } from 'vitest';
import {
  getSessionRoster,
  calculateMissedContacts,
  shouldCountSessionForContact,
  resolveRoster,
  cancelGathering,
  uncancelGathering,
} from '../lib/attendanceRoster';
import type { Contact, Gathering, Rhythm } from '../types';

const NOW = new Date('2026-09-09T14:00:00');

describe('attendanceRoster', () => {
  const contactA: Contact = {
    id: 'c1',
    name: 'Alice',
    role: 'Student',
    location: 'Campus',
    email: 'alice@example.com',
    phone: '123',
    stage: 'Believer',
    lastSeen: '2026-06-01',
    initials: 'A',
    attendance: { e1: true, e2: 'absent' },
  };

  const contactB: Contact = {
    id: 'c2',
    name: 'Bob',
    role: 'Student',
    location: 'Campus',
    email: 'bob@example.com',
    phone: '456',
    stage: 'Seeker',
    lastSeen: '2026-05-01',
    initials: 'B',
    attendance: { e1: true },
  };

  const contactC: Contact = {
    id: 'c3',
    name: 'Charlie',
    role: 'Student',
    location: 'Campus',
    email: 'charlie@example.com',
    phone: '789',
    stage: 'Community',
    lastSeen: '2026-04-01',
    initials: 'C',
    attendance: {},
  };

  const event1: Gathering = {
    id: 'e1',
    name: 'Friday Gathering',
    date: '2026-06-12',
    order: 1,
    createdAt: '2026-06-01',
    roster: ['c1'], // only Alice is on the roster
  };

  const event2: Gathering = {
    id: 'e2',
    name: 'Friday Gathering 2',
    date: '2026-06-05',
    order: 2,
    createdAt: '2026-05-25',
    roster: ['c1', 'c2'], // Alice & Bob on roster
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

    it('counts nobody absent for a cancelled Gathering', () => {
      const cancelled: Gathering = { ...event2, cancelled: true };
      const { absent, nonRoster } = getSessionRoster(cancelled, [contactA, contactB, contactC]);
      expect(absent).toHaveLength(0);
      expect(nonRoster.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3']);
    });
  });

  describe('shouldCountSessionForContact', () => {
    it('does not count a session as missed if contact had never attended and was not in roster at that time', () => {
      const countPast = shouldCountSessionForContact(contactB, event2, [event1, event2]);
      expect(countPast).toBe(true);

      const countC = shouldCountSessionForContact(contactC, event2, [event1, event2]);
      expect(countC).toBe(false);
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
