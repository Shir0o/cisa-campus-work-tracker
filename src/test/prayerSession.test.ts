import { describe, it, expect, beforeEach } from 'vitest';
import { PrayerSessionStore, __resetPrayerSessionCache } from '../lib/prayerSession';

describe('PrayerSessionStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetPrayerSessionCache();
  });

  it('starts with nothing carried', () => {
    expect(PrayerSessionStore.carriedToday('u1', 'c1')).toBe(false);
  });

  it('carries a person for the day', () => {
    PrayerSessionStore.carry('u1', 'c1');
    expect(PrayerSessionStore.carriedToday('u1', 'c1')).toBe(true);
    // Carrying the same person twice is a no-op.
    PrayerSessionStore.carry('u1', 'c1');
    expect(PrayerSessionStore.carriedCount('u1')).toBe(1);
  });

  it('is per-user', () => {
    PrayerSessionStore.carry('u1', 'c1');
    expect(PrayerSessionStore.carriedToday('u2', 'c1')).toBe(false);
  });

  it('resets the carried set when the date changes', () => {
    PrayerSessionStore.carry('u1', 'c1');
    // Simulate a new day by writing a stale day into the bucket.
    const key = `cisa.prayer.session.u1`;
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    window.localStorage.setItem(key, JSON.stringify({ ...parsed, day: '2000-01-01' }));
    __resetPrayerSessionCache();
    expect(PrayerSessionStore.carriedToday('u1', 'c1')).toBe(false);
  });

  it('notifies subscribers when a carry lands', () => {
    let notified = 0;
    const unsub = PrayerSessionStore.subscribe(() => {
      notified++;
    });
    PrayerSessionStore.carry('u1', 'c1');
    expect(notified).toBe(1);
    unsub();
    PrayerSessionStore.carry('u1', 'c2');
    expect(notified).toBe(1);
  });
});