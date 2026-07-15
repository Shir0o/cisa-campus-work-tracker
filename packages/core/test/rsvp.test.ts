import { describe, it, expect } from 'vitest';
import { upcomingEventsForRsvp } from '../src/rsvp';
import type { Event } from '../src/types';

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

describe('upcomingEventsForRsvp', () => {
  it('includes events within the one-day grace period and excludes older ones', () => {
    const events = [
      event({ id: 'yesterday', date: new Date(NOW - DAY_MS + 1000).toISOString() }),
      event({ id: 'too-old', date: new Date(NOW - DAY_MS - 1000).toISOString() }),
    ];
    const result = upcomingEventsForRsvp(events, 3, NOW);
    expect(result.map((r) => r.ev.id)).toEqual(['yesterday']);
  });

  it('sorts soonest first, ties broken by order', () => {
    const events = [
      event({ id: 'later', date: new Date(NOW + DAY_MS * 2).toISOString(), order: 0 }),
      event({ id: 'soon-b', date: new Date(NOW + DAY_MS).toISOString(), order: 2 }),
      event({ id: 'soon-a', date: new Date(NOW + DAY_MS).toISOString(), order: 1 }),
    ];
    const result = upcomingEventsForRsvp(events, 3, NOW);
    expect(result.map((r) => r.ev.id)).toEqual(['soon-a', 'soon-b', 'later']);
  });

  it('caps results to count', () => {
    const events = [1, 2, 3, 4].map((n) =>
      event({ id: `e${n}`, date: new Date(NOW + n * DAY_MS).toISOString() }),
    );
    expect(upcomingEventsForRsvp(events, 2, NOW)).toHaveLength(2);
  });

  it('excludes events with an unparseable date', () => {
    const events = [event({ id: 'bad', date: 'not-a-date' })];
    expect(upcomingEventsForRsvp(events, 3, NOW)).toEqual([]);
  });
});
