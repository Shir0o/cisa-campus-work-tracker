import { describe, it, expect } from 'vitest';
import {
  getSessionRoster,
  calculateMissedContacts,
  shouldCountSessionForContact,
  getRecurringSeriesEventIdsToUpdate,
} from '../lib/attendanceRoster';
import type { Contact, Event } from '../types';

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

  const event1: Event = {
    id: 'e1',
    name: 'Friday Gathering',
    date: '2026-06-12',
    order: 1,
    createdAt: '2026-06-01',
    roster: ['c1'], // only Alice is on the roster
  };

  const event2: Event = {
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
      // On event1, roster is ['c1'].
      // contactA is on roster and present (attendance.e1 === true).
      // contactB is not on roster, but attendance.e1 === true (attended as walk-in).
      // contactC is not on roster and did not attend.
      const { present, absent, nonRoster } = getSessionRoster(event1, contacts);

      expect(present.map((c) => c.id)).toEqual(['c1', 'c2']);
      // contactA attended, contactB attended as walkin, contactC is not on roster so NOT marked absent
      expect(absent.map((c) => c.id)).toEqual([]);
      expect(nonRoster.map((c) => c.id)).toEqual(['c3']);
    });

    it('identifies un-attended roster members as absent', () => {
      const contacts = [contactA, contactB, contactC];
      // On event2, roster is ['c1', 'c2'].
      // contactA has attendance.e2 = 'absent'
      // contactB has no attendance marked for e2
      // contactC is not in roster
      const { present, absent } = getSessionRoster(event2, contacts);

      expect(present).toHaveLength(0);
      // Both c1 and c2 should be in absent because they are on roster and not present
      expect(absent.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    });
  });

  describe('shouldCountSessionForContact', () => {
    it('does not count a session as missed if contact had never attended and was not in roster at that time', () => {
      // Event 2 is in past, Event 1 is newer.
      // contactB was on event2 roster so it should count
      const countPast = shouldCountSessionForContact(contactB, event2, [event1, event2]);
      expect(countPast).toBe(true);

      // contactC never attended anything and was never on event2 roster
      const countC = shouldCountSessionForContact(contactC, event2, [event1, event2]);
      expect(countC).toBe(false);
    });
  });

  describe('calculateMissedContacts', () => {
    it('only tracks contacts who were in roster or previously attended, excluding random non-attendees', () => {
      const contacts = [contactA, contactB, contactC];
      const sessions = [event1, event2]; // e1 is newest, e2 is older

      // contactA attended e1, missed e2
      // contactC never attended and never in roster
      const missed = calculateMissedContacts(contacts, sessions);
      const contactIds = missed.map((m) => m.contact.id);

      expect(contactIds).not.toContain('c3');
    });
  });

  describe('getRecurringSeriesEventIdsToUpdate', () => {
    it('returns all future events in the same recurring series given parentEventId or current event id', () => {
      const seriesParent: Event = {
        id: 'parent-1',
        name: 'Weekly Series',
        date: '2026-06-01',
        order: 1,
        createdAt: '2026-06-01',
        isRecurring: true,
      };
      const child1: Event = {
        id: 'child-1',
        name: 'Weekly Series',
        date: '2026-06-08',
        order: 2,
        createdAt: '2026-06-01',
        isRecurring: true,
        parentEventId: 'parent-1',
      };
      const child2: Event = {
        id: 'child-2',
        name: 'Weekly Series',
        date: '2026-06-15',
        order: 3,
        createdAt: '2026-06-01',
        isRecurring: true,
        parentEventId: 'parent-1',
      };
      const unrelated: Event = {
        id: 'other',
        name: 'Other Meeting',
        date: '2026-06-20',
        order: 4,
        createdAt: '2026-06-01',
      };

      const allEvents = [seriesParent, child1, child2, unrelated];
      const futureIds = getRecurringSeriesEventIdsToUpdate(child1, allEvents);

      expect(futureIds).toEqual(['child-1', 'child-2']);
    });
  });
});
