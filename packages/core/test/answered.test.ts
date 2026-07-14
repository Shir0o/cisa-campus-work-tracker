import { describe, it, expect } from 'vitest';
import { groupAnsweredPrayers, toneForAnsweredId } from '../src/answered';
import type { PrayerRecord } from '../src/types';

const NOW = new Date('2026-07-13T12:00:00Z').getTime();
const DAY_MS = 86_400_000;

const prayer = (overrides: Partial<PrayerRecord> = {}): PrayerRecord => ({
  id: 'p1',
  contactId: 'c1',
  date: new Date(NOW).toISOString(),
  burden: 'burden',
  status: 'answered',
  updatedAt: new Date(NOW).toISOString(),
  ...overrides,
});

describe('groupAnsweredPrayers', () => {
  it('returns empty groups and a zero count for no prayers', () => {
    expect(groupAnsweredPrayers([], NOW)).toEqual({ recent: [], earlier: [], totalThisYear: 0 });
  });

  it('excludes prayers that are not marked answered', () => {
    const pending = prayer({ id: 'pending', status: 'pending' });
    const ongoing = prayer({ id: 'ongoing', status: 'ongoing' });
    const { recent, earlier, totalThisYear } = groupAnsweredPrayers([pending, ongoing], NOW);
    expect(recent).toEqual([]);
    expect(earlier).toEqual([]);
    expect(totalThisYear).toBe(0);
  });

  it('splits answered prayers into recent (last 90 days) vs earlier', () => {
    const justInside = prayer({ id: 'recent', answeredAt: new Date(NOW - 89 * DAY_MS).toISOString() });
    const justOutside = prayer({ id: 'earlier', answeredAt: new Date(NOW - 91 * DAY_MS).toISOString() });
    const { recent, earlier } = groupAnsweredPrayers([justInside, justOutside], NOW);
    expect(recent.map((p) => p.id)).toEqual(['recent']);
    expect(earlier.map((p) => p.id)).toEqual(['earlier']);
  });

  it('falls back from answeredAt to updatedAt to date when computing recency', () => {
    const noAnsweredAt = prayer({ id: 'via-updatedAt', answeredAt: undefined, updatedAt: new Date(NOW - 5 * DAY_MS).toISOString() });
    const { recent } = groupAnsweredPrayers([noAnsweredAt], NOW);
    expect(recent.map((p) => p.id)).toEqual(['via-updatedAt']);
  });

  it('sorts each group newest-first', () => {
    const older = prayer({ id: 'older', answeredAt: new Date(NOW - 10 * DAY_MS).toISOString() });
    const newer = prayer({ id: 'newer', answeredAt: new Date(NOW - 1 * DAY_MS).toISOString() });
    const { recent } = groupAnsweredPrayers([older, newer], NOW);
    expect(recent.map((p) => p.id)).toEqual(['newer', 'older']);
  });

  it('counts only prayers answered in the current calendar year', () => {
    const thisYear = prayer({ id: 'this-year', answeredAt: new Date(NOW - 10 * DAY_MS).toISOString() });
    const lastYear = prayer({ id: 'last-year', answeredAt: new Date(NOW - 400 * DAY_MS).toISOString() });
    const { totalThisYear } = groupAnsweredPrayers([thisYear, lastYear], NOW);
    expect(totalThisYear).toBe(1);
  });
});

describe('toneForAnsweredId', () => {
  it('is deterministic for the same id', () => {
    expect(toneForAnsweredId('abc123')).toBe(toneForAnsweredId('abc123'));
  });

  it('only ever returns one of the four known tones', () => {
    const tones = ['a', 'bb', 'ccc', 'dddd', 'eeeee'].map(toneForAnsweredId);
    tones.forEach((t) => expect(['accent', 'violet', 'amber', 'sage']).toContain(t));
  });
});
