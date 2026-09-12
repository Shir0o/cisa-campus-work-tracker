import { describe, it, expect } from 'vitest';
import { generateOccurrenceDates, diffMissingOccurrences } from '../lib/rhythms';
import type { Rhythm } from '../types';

describe('generateOccurrenceDates', () => {
  it('generates weekly occurrences on the given weekdays', () => {
    const cadence: Rhythm['cadence'] = { type: 'weekly', days: [3] }; // Wednesday
    const dates = generateOccurrenceDates(cadence, '2026-09-09', '2026-09-09', '2026-09-30');
    expect(dates).toEqual(['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30']);
  });

  it('generates weekly occurrences on multiple weekdays', () => {
    const cadence: Rhythm['cadence'] = { type: 'weekly', days: [1, 4] }; // Mon + Thu
    const dates = generateOccurrenceDates(cadence, '2026-09-07', '2026-09-07', '2026-09-13');
    expect(dates).toEqual(['2026-09-07', '2026-09-10']);
  });

  it('generates monthly same-day occurrences, clamped to shorter months', () => {
    const cadence: Rhythm['cadence'] = { type: 'monthly', days: [31], monthlyType: 'same-day' };
    const dates = generateOccurrenceDates(cadence, '2026-01-31', '2026-01-31', '2026-04-30');
    // Jan 31, Feb clamped to 28, Mar 31, Apr clamped to 30.
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('generates monthly relative-day occurrences (e.g. 2nd Wednesday)', () => {
    // 2026-09-09 is the 2nd Wednesday of September 2026.
    const cadence: Rhythm['cadence'] = { type: 'monthly', days: [3], monthlyType: 'relative-day' };
    const dates = generateOccurrenceDates(cadence, '2026-09-09', '2026-09-09', '2026-11-30');
    expect(dates).toEqual(['2026-09-09', '2026-10-14', '2026-11-11']);
  });

  it('returns an empty array when toDate precedes fromDate', () => {
    const cadence: Rhythm['cadence'] = { type: 'weekly', days: [3] };
    expect(generateOccurrenceDates(cadence, '2026-09-09', '2026-09-30', '2026-09-09')).toEqual([]);
  });
});

describe('diffMissingOccurrences', () => {
  it('returns only the dates missing from what already exists', () => {
    const cadence: Rhythm['cadence'] = { type: 'weekly', days: [3] };
    const missing = diffMissingOccurrences(cadence, '2026-09-09', '2026-09-09', '2026-09-30', ['2026-09-09', '2026-09-23']);
    expect(missing).toEqual(['2026-09-16', '2026-09-30']);
  });

  it('returns nothing missing when everything the cadence implies already exists', () => {
    const cadence: Rhythm['cadence'] = { type: 'weekly', days: [3] };
    const missing = diffMissingOccurrences(cadence, '2026-09-09', '2026-09-09', '2026-09-16', ['2026-09-09', '2026-09-16']);
    expect(missing).toEqual([]);
  });
});
