import { describe, it, expect, vi } from 'vitest';
import {
  cn,
  sleep,
  formatPhoneNumber,
  validatePhoneNumber,
  getUserInitials,
  relTime,
  ntfWhen,
  isServiceAccountName,
} from '../lib/utils';

describe('cn', () => {
  it('combines and merges tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'bg-red-500')).toBe('px-2 py-1 bg-red-500');
    expect(cn('p-4', 'p-2')).toBe('p-2'); // twMerge should resolve duplicate padding
    expect(cn('text-red-500', { 'bg-blue-500': true, 'hidden': false })).toBe('text-red-500 bg-blue-500');
  });
});

describe('sleep', () => {
  it('resolves after the given duration', async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('formatPhoneNumber', () => {
  it('handles empty and falsy values', () => {
    expect(formatPhoneNumber('')).toBe('');
    expect(formatPhoneNumber(null as any)).toBe(null as any);
  });

  it('does not format short inputs', () => {
    expect(formatPhoneNumber('12')).toBe('12');
    expect(formatPhoneNumber('123')).toBe('123');
  });

  it('formats partial phone numbers', () => {
    expect(formatPhoneNumber('1234')).toBe('(123) 4');
    expect(formatPhoneNumber('123456')).toBe('(123) 456');
  });

  it('formats complete 10-digit phone numbers', () => {
    expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890');
    expect(formatPhoneNumber('123-456-7890')).toBe('(123) 456-7890');
    expect(formatPhoneNumber('(123) 4567890')).toBe('(123) 456-7890');
  });
});

describe('validatePhoneNumber', () => {
  it('validates 10-digit phone numbers only', () => {
    expect(validatePhoneNumber('1234567890')).toBe(true);
    expect(validatePhoneNumber('(123) 456-7890')).toBe(true);
    expect(validatePhoneNumber('123-456-789')).toBe(false);
    expect(validatePhoneNumber('12345678901')).toBe(false);
  });
});

describe('getUserInitials', () => {
  it('returns ?? for falsy names', () => {
    expect(getUserInitials(null)).toBe('??');
    expect(getUserInitials('')).toBe('??');
  });

  it('extracts initials up to 2 characters', () => {
    expect(getUserInitials('Tony')).toBe('T');
    expect(getUserInitials('Tony Wang')).toBe('TW');
    expect(getUserInitials('Tony Yilong Wang')).toBe('TY');
  });
});

describe('relTime', () => {
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('returns coarse relative buckets for recent times', () => {
    expect(relTime(iso(0))).toBe('just now');
    expect(relTime(iso(5 * 60_000))).toBe('5m ago');
    expect(relTime(iso(3 * 60 * 60_000))).toBe('3h ago');
    expect(relTime(iso(2 * 24 * 60 * 60_000))).toBe('2d ago');
  });

  it('shows a bare date (no year) for older dates within the current year', () => {
    const thisYear = new Date().getFullYear();
    const d = new Date(thisYear, 0, 10).toISOString(); // Jan 10, current year
    if (Date.now() - new Date(d).getTime() > 7 * 24 * 60 * 60_000) {
      expect(relTime(d)).not.toContain(String(thisYear));
    }
  });

  it('includes the year for dates from a previous year', () => {
    const out = relTime('2020-06-03T00:00:00Z');
    expect(out).toContain('2020');
  });

  it('handles invalid, empty, or missing inputs in relTime gracefully', () => {
    expect(relTime('')).toBe('');
    expect(relTime(null as any)).toBe('');
    expect(relTime(undefined as any)).toBe('');
    expect(relTime('invalid-date')).toBe('');
    expect(relTime('not a date string')).toBe('');
  });
});

describe('ntfWhen', () => {
  const futureIso = (msAhead: number) => new Date(Date.now() + msAhead).toISOString();
  const pastIso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('handles future dates correctly', () => {
    // today: diff is >0 but rounds to 0 days
    expect(ntfWhen(futureIso(1000 * 60))).toBe('today');
    // tomorrow: diff is ~1 day ahead
    expect(ntfWhen(futureIso(25 * 60 * 60 * 1000))).toBe('tomorrow');
    // in N days: e.g. 3 days ahead
    expect(ntfWhen(futureIso(3 * 24 * 60 * 60 * 1000 + 1000))).toBe('in 3 days');
    // in N wk: e.g. 10 days ahead
    expect(ntfWhen(futureIso(10 * 24 * 60 * 60 * 1000))).toBe('in 1 wk');
    expect(ntfWhen(futureIso(25 * 24 * 60 * 60 * 1000))).toBe('in 4 wk');
  });

  it('falls back to relTime for past dates', () => {
    expect(ntfWhen(pastIso(5 * 60_000))).toBe('5m ago');
  });

  it('handles invalid, empty, or missing inputs in ntfWhen gracefully', () => {
    expect(ntfWhen('')).toBe('');
    expect(ntfWhen(null as any)).toBe('');
    expect(ntfWhen(undefined as any)).toBe('');
    expect(ntfWhen('invalid-date')).toBe('');
  });
});

describe('isServiceAccountName', () => {
  it('flags seed/service accounts that must not be to-do assignees (issues #348/#349)', () => {
    expect(isServiceAccountName('cisa-ft')).toBe(true);
    expect(isServiceAccountName('cisa-trainee')).toBe(true);
    expect(isServiceAccountName('reviewer-appstore')).toBe(true);
    expect(isServiceAccountName('  CISA-Admin  ')).toBe(true);
  });

  it('keeps real teammates and blank names', () => {
    expect(isServiceAccountName('Tony Wang')).toBe(false);
    expect(isServiceAccountName('reviewer2')).toBe(false);
    expect(isServiceAccountName(null)).toBe(false);
    expect(isServiceAccountName('')).toBe(false);
  });
});
