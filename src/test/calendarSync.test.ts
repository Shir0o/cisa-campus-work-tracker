import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  CAL_CATEGORIES,
  CAL_CAT_BY_ID,
  CAL_APP_URL,
  expandCalEvent,
  expandCalEvents,
  CalFeed,
  CalMap,
  canSeeCalendarSync,
  calStartOfDay,
  calAddDays,
  calAwayWho,
  calAwaySentence,
  calGatheringsMerged,
  calItemsBetween,
  useCalendarSync,
  subscribeLiveCalendarEvents,
  type CalRawEvent,
  type CalAwayItem,
} from '../lib/calendar/calendarSync';
import type { Contact, Event } from '../types';

describe('calendarSync domain engine', () => {
  beforeEach(() => {
    localStorage.clear();
    CalFeed.setEnabled(true);
    CalMap.reset();
    CalMap.set('meeting', 'Weekly');
    CalMap.set('social', 'Small Group');
    CalMap.set('workshop', 'Special');
  });

  describe('Categories and Constants', () => {
    it('provides all 7 standard categories with ids, labels, and dots', () => {
      expect(CAL_CATEGORIES).toHaveLength(7);
      expect(CAL_CAT_BY_ID.product.label).toBe('Product');
      expect(CAL_CAT_BY_ID.product.dot).toBeDefined();
      expect(CAL_CAT_BY_ID.travel.label).toBe('Travel');
      expect(CAL_APP_URL).toBe('https://shared-calendar-6u6.pages.dev/');
    });

    it('determines role visibility with canSeeCalendarSync', () => {
      expect(canSeeCalendarSync('admin')).toBe(true);
      expect(canSeeCalendarSync('manager')).toBe(true);
      expect(canSeeCalendarSync('ft')).toBe(true);
      expect(canSeeCalendarSync('owner')).toBe(true);
      expect(canSeeCalendarSync('operator')).toBe(false);
      expect(canSeeCalendarSync('viewer')).toBe(false);
      expect(canSeeCalendarSync(null)).toBe(false);
    });
  });

  describe('Date Helpers', () => {
    it('calStartOfDay resets hours to 00:00:00.000', () => {
      const d = new Date('2026-08-25T15:30:45Z');
      const start = calStartOfDay(d);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
    });

    it('calAddDays adds exact calendar days', () => {
      const d = new Date('2026-08-25T00:00:00');
      const next = calAddDays(d, 5);
      expect(next.getDate()).toBe(30);
    });
  });

  describe('Recurrence Expansion', () => {
    it('expands non-recurring events within window', () => {
      const raw: CalRawEvent = {
        id: 'ev-1',
        title: 'Team Meetup',
        start: new Date('2026-08-25T10:00:00Z'),
        end: new Date('2026-08-25T11:00:00Z'),
        cat: 'meeting',
      };
      const from = new Date('2026-08-24T00:00:00Z');
      const to = new Date('2026-08-26T00:00:00Z');

      const instances = expandCalEvent(raw, from, to);
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe('ev-1');
      expect(instances[0].title).toBe('Team Meetup');
    });

    it('omits non-recurring events outside window', () => {
      const raw: CalRawEvent = {
        id: 'ev-1',
        title: 'Past Event',
        start: new Date('2026-08-20T10:00:00Z'),
        cat: 'meeting',
      };
      const from = new Date('2026-08-24T00:00:00Z');
      const to = new Date('2026-08-26T00:00:00Z');

      const instances = expandCalEvent(raw, from, to);
      expect(instances).toHaveLength(0);
    });

    it('expands daily recurring event with interval and count', () => {
      const raw: CalRawEvent = {
        id: 'ev-daily',
        title: 'Daily Standup',
        start: new Date('2026-08-20T09:00:00Z'),
        cat: 'meeting',
        rrule: {
          freq: 'daily',
          interval: 2,
          count: 5,
        },
      };
      const from = new Date('2026-08-20T00:00:00Z');
      const to = new Date('2026-08-30T00:00:00Z');

      const instances = expandCalEvent(raw, from, to);
      // instances on Aug 20, 22, 24, 26, 28 (5 total)
      expect(instances).toHaveLength(5);
      expect(instances[0].id).toBe('ev-daily#2026-08-20');
    });

    it('expands weekly recurring event with until date', () => {
      const raw: CalRawEvent = {
        id: 'ev-weekly',
        title: 'Weekly Worship',
        start: new Date('2026-08-07T19:00:00Z'),
        cat: 'meeting',
        rrule: {
          freq: 'weekly',
          until: '2026-08-22',
        },
      };
      const from = new Date('2026-08-01T00:00:00Z');
      const to = new Date('2026-08-31T00:00:00Z');

      const instances = expandCalEvent(raw, from, to);
      // Aug 7, 14, 21
      expect(instances).toHaveLength(3);
    });

    it('expands monthly and yearly recurring events', () => {
      const rawMonthly: CalRawEvent = {
        id: 'ev-monthly',
        title: 'Monthly Review',
        start: new Date('2026-01-15T10:00:00Z'),
        cat: 'meeting',
        rrule: { freq: 'monthly', count: 3 },
      };
      const rawYearly: CalRawEvent = {
        id: 'ev-yearly',
        title: 'Anniversary',
        start: new Date('2025-08-25T10:00:00Z'),
        cat: 'meeting',
        rrule: { freq: 'yearly', count: 2 },
      };

      const from = new Date('2026-01-01T00:00:00Z');
      const to = new Date('2026-12-31T00:00:00Z');

      const monthlyInst = expandCalEvent(rawMonthly, from, to);
      expect(monthlyInst).toHaveLength(3);

      const yearlyInst = expandCalEvent(rawYearly, from, to);
      expect(yearlyInst).toHaveLength(1);
    });

    it('handles weekly with byday array', () => {
      const raw: CalRawEvent = {
        id: 'ev-multi-day',
        title: 'MWF Workout',
        start: new Date('2026-08-24T07:00:00Z'), // Monday
        cat: 'meeting',
        rrule: {
          freq: 'weekly',
          byday: ['MO', 'WE', 'FR'],
          count: 6,
        },
      };
      const from = new Date('2026-08-24T00:00:00Z');
      const to = new Date('2026-09-07T00:00:00Z');

      const instances = expandCalEvents([raw], from, to);
      expect(instances.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('CalFeed and CalMap Stores', () => {
    it('manages enabled toggle and listeners in CalFeed', () => {
      let notified = false;
      const unsub = CalFeed.subscribe(() => {
        notified = true;
      });

      expect(CalFeed.enabled()).toBe(true);
      CalFeed.setEnabled(false);
      expect(CalFeed.enabled()).toBe(false);
      expect(notified).toBe(true);

      unsub();
    });

    it('handles category mappings in CalMap', () => {
      expect(CalMap.kindFor('meeting')).toBe('Weekly');
      expect(CalMap.kindFor('product')).toBeNull();

      CalMap.set('product', 'Outreach');
      expect(CalMap.kindFor('product')).toBe('Outreach');
      expect(CalMap.all().product).toBe('Outreach');
    });
  });

  describe('Who is Away logic', () => {
    const contacts: Contact[] = [
      { id: 'c1', name: 'Mei Lin', stage: 'Leader' } as Contact,
      { id: 'c2', name: 'David Zhang', stage: 'Believer' } as Contact,
    ];

    it('matches staff first name in travel events with calAwayWho', () => {
      const ev1: CalRawEvent = { id: 't1', title: 'Mei — Tokyo trip', cat: 'travel', start: new Date('2026-08-25') };
      const ev2: CalRawEvent = { id: 't2', title: 'Flight to Chicago (David)', cat: 'travel', start: new Date('2026-08-25') };
      const ev3: CalRawEvent = { id: 't3', title: 'Campus Visit', cat: 'travel', start: new Date('2026-08-25') };

      expect(calAwayWho(ev1, contacts)?.name).toBe('Mei Lin');
      expect(calAwayWho(ev2, contacts)?.name).toBe('David Zhang');
      expect(calAwayWho(ev3, contacts)).toBeNull();
    });

    it('generates friendly away sentence with calAwaySentence', () => {
      const awayItems: CalAwayItem[] = [
        {
          id: 't1',
          title: 'Mei away',
          who: { name: 'Mei Lin', id: 'c1' },
          from: new Date('2026-08-25T10:00:00'),
          to: new Date('2026-08-29T18:00:00'),
          synced: true,
        },
      ];

      const sentence = calAwaySentence(awayItems);
      expect(sentence).toContain('Mei is away');
    });
  });

  describe('Gathering Merge and Context Items', () => {
    it('merges tracker gatherings and mapped calendar events soonest first', () => {
      const trackerGatherings: Event[] = [
        {
          id: 'g1',
          name: 'Friday Fellowship',
          type: 'Weekly',
          date: '2026-08-28',
          location: 'Student Union',
          order: 1,
          createdAt: '2026-08-20',
        },
      ];

      const calInstances: CalRawEvent[] = [
        {
          id: 'ce1',
          title: 'Prayer Breakfast',
          start: new Date('2026-08-26T08:00:00'),
          cat: 'social', // mapped to 'Small Group'
          loc: 'Dining Hall',
        },
        {
          id: 'ce2',
          title: 'Project Sprint',
          start: new Date('2026-08-27T10:00:00'),
          cat: 'product', // unmapped
        },
      ];

      const from = new Date('2026-08-24T00:00:00');
      const to = new Date('2026-08-31T00:00:00');

      const merged = calGatheringsMerged(trackerGatherings, calInstances, from, to);
      expect(merged).toHaveLength(2);
      expect(merged[0].title).toBe('Prayer Breakfast');
      expect(merged[0].synced).toBe(true);
      expect(merged[0].type).toBe('Small Group');

      expect(merged[1].name).toBe('Friday Fellowship');
      expect(merged[1].synced).toBe(false);

      const { gatherings, context } = calItemsBetween(calInstances, from, to);
      expect(gatherings).toHaveLength(1);
      expect(context).toHaveLength(1);
      expect(context[0].title).toBe('Project Sprint');
    });
  });

  describe('subscribeLiveCalendarEvents', () => {
    it('subscribes and handles snapshot or error gracefully', () => {
      const onEvents = vi.fn();
      const unsub = subscribeLiveCalendarEvents(onEvents);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('useCalendarSync hook', () => {
    it('provides reactive sync methods and state', () => {
      const { result } = renderHook(() => useCalendarSync([]));

      expect(result.current.isEnabled).toBe(true);

      act(() => {
        result.current.setEnabled(false);
      });
      expect(result.current.isEnabled).toBe(false);

      act(() => {
        result.current.setMapCategory('travel', 'Weekly');
      });
      expect(result.current.calMap.travel).toBe('Weekly');
    });
  });
});
