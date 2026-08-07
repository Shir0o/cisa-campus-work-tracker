import { describe, it, expect } from 'vitest';
import { groupPrayerThread, isTeamPrayer } from '../src/prayerThread';
import type { PrayerRecord } from '../src/types';

const NOW = new Date('2026-07-13T12:00:00Z').getTime(); // Monday, this-week start
const WEEK_MS = 7 * 86_400_000;

const prayer = (overrides: Partial<PrayerRecord> = {}): PrayerRecord => ({
  id: 'p1',
  contactId: 'c1',
  date: new Date(NOW).toISOString(),
  burden: 'burden',
  status: 'pending',
  updatedAt: new Date(NOW).toISOString(),
  ...overrides,
});

describe('groupPrayerThread', () => {
  it('returns all-null/empty groups for no prayers', () => {
    expect(groupPrayerThread([], NOW)).toEqual({
      weekItem: null,
      lastItem: null,
      earlier: [],
      needsMark: false,
    });
  });

  it('surfaces a prayer dated this week as weekItem', () => {
    const p = prayer({ id: 'this-week', date: new Date(NOW).toISOString() });
    const { weekItem, lastItem, earlier } = groupPrayerThread([p], NOW);
    expect(weekItem?.id).toBe('this-week');
    expect(lastItem).toBeNull();
    expect(earlier).toEqual([]);
  });

  it('falls back to the most recent prior prayer as lastItem when nothing is dated this week', () => {
    const p = prayer({ id: 'last-week', date: new Date(NOW - WEEK_MS).toISOString() });
    const { weekItem, lastItem } = groupPrayerThread([p], NOW);
    expect(weekItem).toBeNull();
    expect(lastItem?.id).toBe('last-week');
  });

  it('flags needsMark when the last-week prayer is still pending', () => {
    const pending = prayer({ id: 'last-week', date: new Date(NOW - WEEK_MS).toISOString(), status: 'pending' });
    expect(groupPrayerThread([pending], NOW).needsMark).toBe(true);

    const marked = prayer({ id: 'last-week', date: new Date(NOW - WEEK_MS).toISOString(), status: 'ongoing' });
    expect(groupPrayerThread([marked], NOW).needsMark).toBe(false);
  });

  it('buckets everything before last-week into earlier, newest first', () => {
    const thisWeek = prayer({ id: 'this-week', date: new Date(NOW).toISOString() });
    const lastWeek = prayer({ id: 'last-week', date: new Date(NOW - WEEK_MS).toISOString() });
    const twoWeeksAgo = prayer({ id: 'two-weeks-ago', date: new Date(NOW - 2 * WEEK_MS).toISOString() });
    const threeWeeksAgo = prayer({ id: 'three-weeks-ago', date: new Date(NOW - 3 * WEEK_MS).toISOString() });

    const { weekItem, lastItem, earlier } = groupPrayerThread(
      [threeWeeksAgo, thisWeek, twoWeeksAgo, lastWeek],
      NOW,
    );
    expect(weekItem?.id).toBe('this-week');
    expect(lastItem?.id).toBe('last-week');
    expect(earlier.map((p) => p.id)).toEqual(['two-weeks-ago', 'three-weeks-ago']);
  });
});

describe('isTeamPrayer', () => {
  it('treats a prayer with no flag as the team\'s — every doc written before the toggle existed', () => {
    expect(isTeamPrayer(prayer())).toBe(true);
  });

  it('honours the flag both ways', () => {
    expect(isTeamPrayer(prayer({ teamPrayer: true }))).toBe(true);
    expect(isTeamPrayer(prayer({ teamPrayer: false }))).toBe(false);
  });
});
