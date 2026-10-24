/**
 * Looking back's date handling (#1768).
 *
 * Two escapes this guards:
 *  - `activities.createdAt` is written as an ISO string by `logActivity`, but
 *    `server.ts` (webhook + batch ingest) and `tagEngine` write a Firestore
 *    `Timestamp`. One such row made `new Date(createdAt)` invalid and the
 *    phone view threw "Invalid time value" over the whole screen.
 *  - A record that runs for years printed the same marker ("September 19") for
 *    two different years, and flipped its label order at the 7-day boundary.
 */
import { describe, it, expect } from 'vitest';
import { clockLabel, dayMark, historyMs, historyRows } from '../views/historyTime';

const TIMESTAMP_SHAPE = {
  seconds: 1_760_000_000,
  nanoseconds: 0,
  toDate: () => new Date(1_760_000_000_000),
  toMillis: () => 1_760_000_000_000,
};

const t = (key: string, fallback?: string) => fallback ?? key;

const isoAt = (y: number, m: number, d: number, h = 9) =>
  new Date(y, m - 1, d, h, 40).toISOString();

describe('historyMs', () => {
  it('reads an ISO string, a Timestamp object and a number', () => {
    expect(historyMs('2026-10-24T09:40:00.000Z')).toBe(Date.parse('2026-10-24T09:40:00.000Z'));
    expect(historyMs(TIMESTAMP_SHAPE)).toBe(1_760_000_000_000);
    expect(historyMs(1_760_000_000_000)).toBe(1_760_000_000_000);
  });

  it('returns null for a value it cannot read', () => {
    expect(historyMs(undefined)).toBeNull();
    expect(historyMs('not a date')).toBeNull();
    expect(historyMs({})).toBeNull();
  });
});

describe('clockLabel', () => {
  it('formats a Timestamp-shaped createdAt instead of throwing', () => {
    const label = clockLabel(TIMESTAMP_SHAPE, 'en');
    expect(typeof label).toBe('string');
    expect(label).toMatch(/\d/);
  });

  it('formats an ISO string in the reader language', () => {
    const iso = isoAt(2026, 10, 24, 13);
    expect(clockLabel(iso, 'en')).toMatch(/PM/);
    expect(clockLabel(iso, 'es')).not.toMatch(/AM|PM/);
  });

  it('returns an empty string rather than throwing on a bad value', () => {
    expect(clockLabel(undefined, 'en')).toBe('');
    expect(clockLabel('nope', 'en')).toBe('');
  });
});

describe('dayMark', () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9).toISOString();

  it('names today and yesterday in the reader language', () => {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9).toISOString();
    const en = { today: dayMark(today, 'en', t), yesterday: dayMark(yesterday, 'en', t) };
    const es = { today: dayMark(today, 'es', t), yesterday: dayMark(yesterday, 'es', t) };
    expect(en.today.label).toBe('Today');
    expect(en.yesterday.label).toBe('Yesterday');
    expect(es.today.label).toBe('Hoy');
    expect(es.yesterday.label).toBe('Ayer');
  });

  it('always puts the date in the label and the weekday in the sub', () => {
    const thisWeek = dayMark(isoAt(2026, 10, 22), 'en', t);
    const older = dayMark(isoAt(2026, 10, 16), 'en', t);
    expect(thisWeek.label).toBe('October 22');
    expect(thisWeek.sub).toBe('Thursday');
    expect(older.label).toBe('October 16');
    expect(older.sub).toBe('Friday');
  });

  it('carries the year when it is not this year, so two Septembers differ', () => {
    const thisYear = dayMark(isoAt(now.getFullYear(), 9, 19), 'en', t);
    const lastYear = dayMark(isoAt(now.getFullYear() - 1, 9, 19), 'en', t);
    expect(thisYear.label).toBe('September 19');
    expect(lastYear.label).toBe(`September 19, ${now.getFullYear() - 1}`);
    expect(thisYear.label).not.toBe(lastYear.label);
  });

  it('returns an empty mark for a value it cannot read, without throwing', () => {
    expect(dayMark({}, 'en', t)).toEqual({ label: '', sub: '' });
  });
});

describe('historyRows', () => {
  const at = (daysAgo: number, hour = 9) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const item = (id: string, createdAt: unknown) => ({ id, createdAt });
  const markers = (rows: ReturnType<typeof historyRows>) =>
    rows.filter((r) => r.type === 'date').map((r) => r.key);

  it('announces each day once, in order, when a row arrives as a Timestamp', () => {
    // Firestore returns strings and Timestamps in separate blocks, so the same
    // day reaches the view twice and out of order.
    //
    // "Late" is pinned to 20:00 today rather than `Date.now()`: with the clock
    // as the fixture, the test asserted a later-than-08:00 ordering that only
    // held after 8am local, and went red in CI whenever it ran before then
    // (04:33 UTC, 2026-10-25).
    const lateToday = at(0, 20);
    const lateMs = new Date(lateToday).getTime();
    const rows = historyRows([
      item('today-iso', at(0, 8)),
      item('yesterday-iso', at(1, 8)),
      item('today-late', {
        seconds: Math.floor(lateMs / 1000),
        toMillis: () => lateMs,
        toDate: () => new Date(lateMs),
      }),
    ]);
    const keys = markers(rows);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(2);
    expect(rows[0].type).toBe('date');
    expect((rows[0] as any).at).not.toBeUndefined();
    // Newest first.
    const ids = rows.filter((r) => r.type === 'item').map((r) => (r as any).a.id);
    expect(ids).toEqual(['today-late', 'today-iso', 'yesterday-iso']);
  });

  it('keeps an undatable row in the stream, at the end, without a marker', () => {
    const rows = historyRows([item('good', at(0)), item('broken', 'not a date')]);
    expect(rows.filter((r) => r.type === 'date')).toHaveLength(1);
    expect((rows[rows.length - 1] as any).a.id).toBe('broken');
  });
});
