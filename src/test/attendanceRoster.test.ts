import { describe, it, expect } from 'vitest';
import {
  getSessionRoster,
  calculateMissedContacts,
  shouldCountSessionForContact,
  getRecurringSeriesEventIdsToUpdate,
  assignSeriesAnchor,
  planGatheringSeriesBackfill,
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

  describe('assignSeriesAnchor', () => {
    it('sets parentEventId to the earliest occurrence id for all occurrences in a recurring series', () => {
      const occurrences = [
        { id: 'doc-1', date: '2026-09-09' },
        { id: 'doc-2', date: '2026-09-16' },
        { id: 'doc-3', date: '2026-09-23' },
      ];
      const result = assignSeriesAnchor(occurrences, true);
      expect(result).toEqual([
        { id: 'doc-1', date: '2026-09-09', parentEventId: 'doc-1' },
        { id: 'doc-2', date: '2026-09-16', parentEventId: 'doc-1' },
        { id: 'doc-3', date: '2026-09-23', parentEventId: 'doc-1' },
      ]);
    });

    it('anchors at the earliest date even when occurrences are supplied out of order', () => {
      const occurrences = [
        { id: 'doc-3', date: '2026-09-23' },
        { id: 'doc-1', date: '2026-09-09' },
        { id: 'doc-2', date: '2026-09-16' },
      ];
      const result = assignSeriesAnchor(occurrences, true);
      expect(result).toEqual([
        { id: 'doc-3', date: '2026-09-23', parentEventId: 'doc-1' },
        { id: 'doc-1', date: '2026-09-09', parentEventId: 'doc-1' },
        { id: 'doc-2', date: '2026-09-16', parentEventId: 'doc-1' },
      ]);
    });

    it('does not set parentEventId for a non-recurring event', () => {
      const occurrences = [{ id: 'doc-1', date: '2026-09-09' }];
      const result = assignSeriesAnchor(occurrences, false);
      expect(result).toEqual([{ id: 'doc-1', date: '2026-09-09' }]);
    });

    it('returns empty array when given empty occurrences', () => {
      expect(assignSeriesAnchor([], true)).toEqual([]);
    });
  });

  describe('planGatheringSeriesBackfill', () => {
    it('groups recurring gatherings by name and weekday, anchoring to earliest occurrence', () => {
      const gatherings = [
        // Wednesday Bible Study (2026-09-09 and 2026-09-16 are Wednesdays)
        { id: 'wed-2', name: 'Bible Study', date: '2026-09-16', isRecurring: true },
        { id: 'wed-1', name: 'Bible Study', date: '2026-09-09', isRecurring: true },
      ];
      const plan = planGatheringSeriesBackfill(gatherings);
      expect(plan).toEqual([
        { id: 'wed-1', parentEventId: 'wed-1' },
        { id: 'wed-2', parentEventId: 'wed-1' },
      ]);
    });

    it('keeps two terms sharing a weekday but not a name separate', () => {
      // 2026-09-10 and 2026-09-17 are Thursdays
      const gatherings = [
        { id: 'cm-1', name: 'College Meeting', date: '2026-09-10', isRecurring: true },
        { id: 'bs-1', name: 'Bible Study', date: '2026-09-10', isRecurring: true },
        { id: 'cm-2', name: 'College Meeting', date: '2026-09-17', isRecurring: true },
        { id: 'bs-2', name: 'Bible Study', date: '2026-09-17', isRecurring: true },
      ];
      const plan = planGatheringSeriesBackfill(gatherings);
      const cmPlans = plan.filter((p) => p.id.startsWith('cm'));
      const bsPlans = plan.filter((p) => p.id.startsWith('bs'));
      expect(cmPlans).toEqual([
        { id: 'cm-1', parentEventId: 'cm-1' },
        { id: 'cm-2', parentEventId: 'cm-1' },
      ]);
      expect(bsPlans).toEqual([
        { id: 'bs-1', parentEventId: 'bs-1' },
        { id: 'bs-2', parentEventId: 'bs-1' },
      ]);
    });

    it('skips non-recurring gatherings and gatherings that already have parentEventId', () => {
      const gatherings = [
        { id: 'oneoff', name: 'Welcome BBQ', date: '2026-09-05', isRecurring: false },
        { id: 'migrated-1', name: 'Prayer', date: '2026-09-08', isRecurring: true, parentEventId: 'migrated-1' },
        { id: 'migrated-2', name: 'Prayer', date: '2026-09-15', isRecurring: true, parentEventId: 'migrated-1' },
        { id: 'unmigrated', name: 'New Series', date: '2026-09-11', isRecurring: true },
      ];
      const plan = planGatheringSeriesBackfill(gatherings);
      expect(plan).toEqual([
        { id: 'unmigrated', parentEventId: 'unmigrated' },
      ]);
    });
  });
});
