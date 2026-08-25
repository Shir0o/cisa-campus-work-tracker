import { describe, expect, it } from 'vitest';
import {
  GOAL_DEFAULT_COUNT,
  GOAL_MAX,
  GOAL_MIN,
  normalizeDayGoal,
  goalCountFor,
  goalNewToday,
  goalMet,
  goalFill,
  goalShow,
  type DayGoal,
} from '../lib/goal';

const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0);

const isoOn = (now: number, hour = 10) => {
  const d = new Date(startOf(now));
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const daysAgo = (now: number, d: number) => {
  const x = new Date(startOf(now));
  x.setDate(x.getDate() - d);
  return x.toISOString();
};

const contact = (over: Record<string, unknown> = {}) =>
  ({ id: 'c', name: 'Ana', ...over }) as { id: string; name: string; createdBy?: string; addedBy?: string; createdAt?: string };

describe('normalizeDayGoal', () => {
  it('defaults to on with 5 when nothing is set', () => {
    expect(normalizeDayGoal(null)).toEqual({ on: true, count: GOAL_DEFAULT_COUNT });
    expect(normalizeDayGoal(undefined)).toEqual({ on: true, count: GOAL_DEFAULT_COUNT });
    expect(normalizeDayGoal({})).toEqual({ on: true, count: GOAL_DEFAULT_COUNT });
  });

  it('keeps a valid pair and clamps to 1..20', () => {
    expect(normalizeDayGoal({ on: false, count: 7 })).toEqual({ on: false, count: 7 });
    expect(normalizeDayGoal({ count: 99 })).toEqual({ on: true, count: GOAL_MAX });
    expect(normalizeDayGoal({ count: 0 })).toEqual({ on: true, count: GOAL_MIN });
    expect(normalizeDayGoal({ count: 2.6 })).toEqual({ on: true, count: 3 });
    expect(normalizeDayGoal({ on: 'yes' })).toEqual({ on: true, count: GOAL_DEFAULT_COUNT });
  });
});

describe('goalCountFor', () => {
  const now = new Date('2026-08-25T12:00:00').getTime();

  it('counts only today’s people added by the uid', () => {
    const contacts = [
      contact({ createdBy: 'me', createdAt: isoOn(now, 9) }),
      contact({ createdBy: 'me', createdAt: isoOn(now, 14) }),
      contact({ createdBy: 'me', createdAt: daysAgo(now, 1) }),
      contact({ createdBy: 'them', createdAt: isoOn(now, 10) }),
      contact({ createdBy: 'me' }),
    ];
    expect(goalCountFor(contacts, 'me', now)).toBe(2);
  });

  it('honours addedBy and the null uid', () => {
    expect(goalCountFor([contact({ addedBy: 'me', createdAt: isoOn(now) })], 'me', now)).toBe(1);
    expect(goalCountFor([contact({ createdBy: 'me', createdAt: isoOn(now) })], null, now)).toBe(0);
  });
});

describe('goalNewToday / goalMet / goalFill / goalShow', () => {
  const now = new Date('2026-08-25T12:00:00').getTime();
  const goal: DayGoal = { on: true, count: 5 };

  it('goalNewToday counts everyone’s new people today, and only today', () => {
    const contacts = [
      contact({ createdBy: 'x', createdAt: isoOn(now, 8) }),
      contact({ createdBy: 'y', createdAt: isoOn(now, 16) }),
      contact({ createdBy: 'z', createdAt: daysAgo(now, 1) }),
      contact({ createdBy: 'z' }),
    ];
    expect(goalNewToday(contacts, now)).toBe(2);
  });

  it('goalMet/fill/show behave like the day’s gate', () => {
    expect(goalMet(4, goal)).toBe(false);
    expect(goalMet(5, goal)).toBe(true);
    expect(goalFill(0, goal)).toBe(0);
    expect(goalFill(3, goal)).toBe(0.6);
    expect(goalFill(9, goal)).toBe(1);
    expect(goalShow(goal, 3, true)).toBe(true);
    expect(goalShow(goal, 5, true)).toBe(false);
    expect(goalShow(goal, 3, false)).toBe(false);
    expect(goalShow({ on: false, count: 5 }, 3, true)).toBe(false);
  });
});