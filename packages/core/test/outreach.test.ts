import { describe, it, expect } from 'vitest';
import {
  outreachDaysSince,
  outreachWhen,
  outreachMonthKey,
  outreachInitials,
  outreachHandedLine,
  outreachReached,
  outreachPending,
  outreachNewestFirst,
  outreachStats,
  type OutreachName,
  type OutreachRecord,
} from '../src/outreach';
import type { Touch } from '../src/myday';
import { canSeeOutreach, canLogOutreach, canSeeVisits, canLogVisits } from '../src/permissions';

const NOW = new Date('2026-07-13T12:00:00Z').getTime();
const DAY_MS = 86_400_000;

const isoDaysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString().slice(0, 10);

const name = (overrides: Partial<OutreachName> = {}): OutreachName => ({
  id: 'ON-1',
  name: 'Duy Pham',
  contact: '+1 (614) 555-0101',
  spokeWith: 'u1',
  note: '',
  contactId: 'C-1',
  takenBy: null,
  ...overrides,
});

const record = (overrides: Partial<OutreachRecord> = {}): OutreachRecord => ({
  id: 'OT-1',
  date: isoDaysAgo(5),
  where: 'Cedar Park — the north lawn',
  went: ['u1'],
  others: 8,
  handed: { bibles: 34, tracts: 120, booklets: 26 },
  how: 'Warm afternoon.',
  photoCount: 0,
  names: [name()],
  ...overrides,
});

const touch = (contactId: string, msAgo: number): Touch => ({ contactId, ms: NOW - msAgo, note: '' });

describe('outreach dates', () => {
  it('counts whole days since the outing', () => {
    expect(outreachDaysSince(isoDaysAgo(0), NOW)).toBe(0);
    expect(outreachDaysSince(isoDaysAgo(1), NOW)).toBe(1);
    expect(outreachDaysSince(isoDaysAgo(63), NOW)).toBe(63);
  });

  it('words recent outings and dates older ones', () => {
    expect(outreachWhen(isoDaysAgo(0), NOW)).toBe('today');
    expect(outreachWhen(isoDaysAgo(1), NOW)).toBe('yesterday');
    expect(outreachWhen(isoDaysAgo(5), NOW)).toBe('5 days ago');
    expect(outreachWhen(isoDaysAgo(40), NOW)).toBe('Jun 3');
  });

  it('groups by YYYY-MM for the This month / Earlier split', () => {
    expect(outreachMonthKey('2026-07-01')).toBe('2026-07');
    expect(outreachMonthKey(isoDaysAgo(5))).toBe(new Date(NOW - 5 * DAY_MS).toISOString().slice(0, 7));
  });

  it('makes initials and a handed-out line', () => {
    expect(outreachInitials('Duy Pham')).toBe('DP');
    expect(outreachHandedLine({ bibles: 34, tracts: 120, booklets: 26 })).toBe('34 Bibles · 120 tracts · 26 booklets');
    expect(outreachHandedLine({ bibles: 0, tracts: 0, booklets: 0 })).toBe('');
  });
});

describe('outreachReached', () => {
  it('is false without a contactId — nobody to ring', () => {
    const n = name({ contactId: null });
    expect(outreachReached(record(), n, [touch('C-1', DAY_MS)])).toBe(false);
  });

  it('is false when the only touches are on or before the outing day', () => {
    const n = name({ contactId: 'C-1' });
    const onTheDay = { contactId: 'C-1', ms: new Date(record().date + 'T23:59:00Z').getTime(), note: '' };
    expect(outreachReached(record(), n, [onTheDay])).toBe(false);
    expect(outreachReached(record(), n, [touch('C-1', 6 * DAY_MS)])).toBe(false);
  });

  it('is true once someone has touched the contact after the outing date', () => {
    const n = name({ contactId: 'C-1' });
    expect(outreachReached(record(), n, [touch('C-1', DAY_MS)])).toBe(true);
  });

  it('only counts touches on THIS contact, not anyone else’s', () => {
    const n = name({ contactId: 'C-1' });
    expect(outreachReached(record(), n, [touch('C-2', DAY_MS)])).toBe(false);
  });
});

describe('outreachPending', () => {
  it('lists only unreached names, oldest first', () => {
    const older = record({
      id: 'OT-2',
      date: isoDaysAgo(34),
      names: [name({ id: 'ON-2', name: 'Tomas Reyes', contactId: 'C-2' })],
    });
    const newer = record({ names: [name({ id: 'ON-1', contactId: 'C-1' })] });
    const reached = record({
      id: 'OT-3',
      date: isoDaysAgo(3),
      names: [name({ id: 'ON-3', name: 'Aisha Nur', contactId: 'C-3' })],
    });

    const pending = outreachPending([newer, reached, older], [touch('C-3', DAY_MS)]);
    expect(pending.map((p) => p.name.id)).toEqual(['ON-2', 'ON-1']);
    expect(pending[0].days).toBeGreaterThan(pending[1].days);
  });

  it('returns empty when everyone has been reached', () => {
    const records = [record({ names: [name({ contactId: 'C-1' })] })];
    expect(outreachPending(records, [touch('C-1', DAY_MS)])).toEqual([]);
  });

  it('sorts newest first for the month lists', () => {
    const sorted = outreachNewestFirst([record({ id: 'a', date: isoDaysAgo(34) }), record({ id: 'b', date: isoDaysAgo(5) })]);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('outreachStats', () => {
  it('counts months out, names that came back, and Bibles into hands', () => {
    const records = [
      record({ names: [name(), name({ id: 'ON-2', contactId: 'C-2' })] }),
      record({ id: 'OT-2', date: isoDaysAgo(34), handed: { bibles: 22, tracts: 90, booklets: 15 } }),
    ];
    expect(outreachStats(records)).toEqual({ months: 2, names: 3, bibles: 56 });
  });
});

describe('outreach permissions — full-timers + community', () => {
  it('admin and community (viewer) can see and log outreach', () => {
    for (const role of ['admin', 'viewer']) {
      expect(canSeeOutreach(role)).toBe(true);
      expect(canLogOutreach(role)).toBe(true);
    }
    // Trainees and students don't see it at all.
    for (const role of ['manager', 'operator', null]) {
      expect(canSeeOutreach(role)).toBe(false);
      expect(canLogOutreach(role)).toBe(false);
    }
  });

  it('visits stay full-timer-only when built', () => {
    expect(canSeeVisits('admin')).toBe(true);
    expect(canLogVisits('admin')).toBe(true);
    for (const role of ['manager', 'operator', 'viewer', null]) {
      expect(canSeeVisits(role)).toBe(false);
      expect(canLogVisits(role)).toBe(false);
    }
  });
});
