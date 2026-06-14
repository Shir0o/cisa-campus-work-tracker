import { describe, it, expect } from 'vitest';
import { relTime } from '../lib/utils';

describe('relTime', () => {
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('returns coarse relative buckets for recent times', () => {
    expect(relTime(iso(0))).toBe('just now');
    expect(relTime(iso(5 * 60_000))).toBe('5m ago');
    expect(relTime(iso(3 * 60 * 60_000))).toBe('3h ago');
    expect(relTime(iso(2 * 24 * 60 * 60_000))).toBe('2d ago');
  });

  it('shows a bare date (no year) for older dates within the current year', () => {
    // 10 days into this year is always >7 days ago by mid-year and same-year.
    const thisYear = new Date().getFullYear();
    const d = new Date(thisYear, 0, 10).toISOString(); // Jan 10, current year
    // Only assert when "now" is comfortably past mid-Jan to keep it >7d & same year.
    if (Date.now() - new Date(d).getTime() > 7 * 24 * 60 * 60_000) {
      expect(relTime(d)).not.toContain(String(thisYear));
    }
  });

  it('includes the year for dates from a previous year', () => {
    const out = relTime('2020-06-03T00:00:00Z');
    expect(out).toContain('2020');
  });
});
