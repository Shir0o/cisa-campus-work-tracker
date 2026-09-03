import { describe, it, expect } from 'vitest';
import {
  buildGatheringViewModel,
  startOfWeekMonday,
  endOfWeekSunday,
  type ChipState,
} from '../lib/gatheringViewModel';
import type { Contact, Event } from '../types';

// Fixed Wednesday 2026-09-09 so tests are deterministic. 09-09 is mid-week:
// Mon 2026-09-07 → Sun 2026-09-13. Tuesday is the day before, Monday is two days before.
const NOW = new Date('2026-09-09T14:00:00');

const baseEvent = (overrides: Partial<Event> & { id: string }): Event => ({
  name: 'Wednesday Bible Study',
  date: '2026-09-09',
  order: 0,
  type: 'Weekly',
  createdAt: '2026-09-01T00:00:00Z',
  ...overrides,
});
const baseContact = (overrides: Partial<Contact> & { id: string }): Contact => ({
  id: overrides.id,
  name: 'Alex',
  role: 'Student',
  location: 'Campus',
  email: 'alex@example.com',
  phone: '123',
  stage: 'Believer',
  lastSeen: '2026-09-01',
  initials: 'A',
  ...overrides,
});

const localYmd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

describe('startOfWeekMonday / endOfWeekSunday', () => {
  it('returns Monday for a Wednesday', () => {
    const monday = startOfWeekMonday(new Date('2026-09-09T14:00:00'));
    expect(monday.getDay()).toBe(1); // Monday
    expect(localYmd(monday)).toBe('2026-09-07');
  });
  it('returns Sunday for a Wednesday, inclusive end-of-day', () => {
    const sunday = endOfWeekSunday(new Date('2026-09-09T14:00:00'));
    expect(sunday.getDay()).toBe(0); // Sunday
    expect(localYmd(sunday)).toBe('2026-09-13');
  });

  it('treats Sunday as belonging to the week that just ended (Mon–Sun)', () => {
    // Sunday evening 2026-09-13 belongs to the week Mon 09-07 → Sun 09-13.
    const sunday = new Date('2026-09-13T20:00:00');
    expect(localYmd(startOfWeekMonday(sunday))).toBe('2026-09-07');
    expect(localYmd(endOfWeekSunday(sunday))).toBe('2026-09-13');
  });

  it('treats Sunday morning as belonging to the same week, not the next', () => {
    const sun = new Date('2026-09-13T01:00:00');
    expect(localYmd(startOfWeekMonday(sun))).toBe('2026-09-07');
  });
});

describe('buildGatheringViewModel — week bounds', () => {
  it('puts a Sunday-evening Gathering in the current Monday–Sunday week', () => {
    // Sunday 2026-09-13 evening: belongs to current week (Mon 09-07 → Sun 09-13).
    const sundayEvent = baseEvent({ id: 'sun', name: 'Sunday Gathering', date: '2026-09-13' });
    const m = buildGatheringViewModel({ events: [sundayEvent], contacts: [], now: NOW });
    const found = m.thisWeek.some((g) => g.gatherings.some((ev) => ev.id === 'sun'));
    expect(found).toBe(true);
  });

  it('puts the next day (Monday 09-14) in the next week, not this one', () => {
    const monNext = baseEvent({ id: 'next-mon', name: 'Next Monday', date: '2026-09-14' });
    const m = buildGatheringViewModel({ events: [monNext], contacts: [], now: NOW });
    expect(m.thisWeek.some((g) => g.gatherings.some((ev) => ev.id === 'next-mon'))).toBe(false);
    // Future one-offs don't belong on the past-tense When-we-met list.
    // They live in the Coming-up section above (or in This-week when the week arrives).
    expect(m.oneOffs.find((g) => g.id === 'next-mon')).toBeUndefined();
  });
});

describe('buildGatheringViewModel — this-week grouping', () => {
  it('groups two Gatherings on one day under a single date heading', () => {
    // Two Thursday Gatherings land on 2026-09-10 (Thu of same week).
    const thuA = baseEvent({ id: 'thuA', name: 'Bible Study', date: '2026-09-10', type: 'Weekly' });
    const thuB = baseEvent({ id: 'thuB', name: 'College Meeting', date: '2026-09-10', type: 'Weekly' });
    const m = buildGatheringViewModel({ events: [thuA, thuB], contacts: [], now: NOW });
    expect(m.thisWeek.length).toBe(1); // one date heading
    expect(m.thisWeek[0].date).toBe('2026-09-10');
    expect(m.thisWeek[0].gatherings.map((g) => g.id).sort()).toEqual(['thuA', 'thuB']);
  });

  it('keeps two Gatherings on one day as separate rows with their own roster & attendance', () => {
    const thuA = baseEvent({ id: 'thuA', name: 'Bible Study', date: '2026-09-10', roster: ['c1'] });
    const thuB = baseEvent({ id: 'thuB', name: 'College Meeting', date: '2026-09-10', roster: ['c2'] });
    const m = buildGatheringViewModel({ events: [thuA, thuB], contacts: [], now: NOW });
    const group = m.thisWeek[0];
    expect(group.gatherings).toHaveLength(2);
    expect(group.gatherings.find((g) => g.id === 'thuA')?.expectedCount).toBe(1);
    expect(group.gatherings.find((g) => g.id === 'thuB')?.expectedCount).toBe(1);
  });

  it('says so plainly when a week has no Gatherings', () => {
    const m = buildGatheringViewModel({ events: [], contacts: [], now: NOW });
    expect(m.thisWeekEmpty).toBe(true);
  });
});

describe('buildGatheringViewModel — chip state', () => {
  it('marks a past Gathering as taken when attendanceTakenAt is stamped', () => {
    const past = baseEvent({
      id: 'past-taken',
      date: '2026-09-02',
      parentEventId: 'past-taken',
      attendanceTakenAt: '2026-09-02T20:00:00Z',
      attendanceTakenBy: 'Alice',
      attendanceTakenById: 'u-alice',
    });
    const m = buildGatheringViewModel({ events: [past], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'past-taken')!;
    expect(rhythm).toBeDefined();
    const chip = rhythm.chips.find((c) => c.id === 'past-taken')!;
    expect(chip.state).toBe<ChipState>('taken');
  });

  it('marks a past Gathering as happened-not-taken when the stamp is absent (even with empty attendance)', () => {
    // This is the rejected derivation: a past Gathering with no present[] must NOT read as taken.
    const past = baseEvent({ id: 'past-empty', date: '2026-09-02', parentEventId: 'past-empty' });
    const m = buildGatheringViewModel({ events: [past], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'past-empty')!;
    expect(rhythm.chips[0].state).toBe<ChipState>('happened-not-taken');
  });

  it('marks a Gathering in the current week distinctly', () => {
    const current = baseEvent({ id: 'cur', date: '2026-09-09', parentEventId: 'cur' });
    const m = buildGatheringViewModel({ events: [current], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'cur')!;
    expect(rhythm.chips[0].state).toBe<ChipState>('current-week');
  });

  it('marks a Gathering in a future week as ahead and faint', () => {
    const future = baseEvent({ id: 'fut', date: '2026-10-07', parentEventId: 'fut' });
    const m = buildGatheringViewModel({ events: [future], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'fut')!;
    expect(rhythm.chips[0].faint).toBe(true);
  });

  it('marks a stamped current-week Gathering as current-week (not taken — current-week wins)', () => {
    // Story 13: this week's chip must be marked distinctly from taken.
    const cur = baseEvent({
      id: 'cur-taken',
      date: '2026-09-09',
      parentEventId: 'cur-taken',
      attendanceTakenAt: '2026-09-09T20:00:00Z',
    });
    const m = buildGatheringViewModel({ events: [cur], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'cur-taken')!;
    expect(rhythm.chips[0].state).toBe<ChipState>('current-week');
  });

  it('does NOT mark a future Gathering as taken just because attendanceTakenAt exists', () => {
    // Future-dated but stamped — chip state is still ahead (you can't have taken attendance
    // for a Gathering that hasn't happened yet).
    const future = baseEvent({
      id: 'fut-stamped',
      date: '2026-10-07',
      parentEventId: 'fut-stamped',
      attendanceTakenAt: '2026-09-01T00:00:00Z',
    });
    const m = buildGatheringViewModel({ events: [future], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'fut-stamped')!;
    expect(rhythm.chips[0].state).toBe<ChipState>('ahead');
  });
});

describe('buildGatheringViewModel — Rhythm grouping', () => {
  it('folds a recurring Rhythm (parentEventId set) into one row, in time order', () => {
    // 17 weeks of Wednesday Bible Study — first was created with parentEventId = id-of-first.
    const first = baseEvent({
      id: 'wed-1',
      date: '2026-09-09',
      parentEventId: 'wed-1',
    });
    const weeks: Event[] = [first];
    for (let i = 1; i < 17; i++) {
      const d = new Date('2026-09-09T00:00:00');
      d.setDate(d.getDate() + i * 7);
      weeks.push(baseEvent({ id: `wed-${i + 1}`, date: d.toISOString().slice(0, 10), parentEventId: 'wed-1' }));
    }
    const m = buildGatheringViewModel({ events: weeks, contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'wed-1')!;
    expect(rhythm).toBeDefined();
    expect(rhythm.chips.map((c) => c.id)).toEqual(weeks.map((w) => w.id));
    expect(rhythm.chips[0].date).toBe('2026-09-09');
    expect(rhythm.chips[rhythm.chips.length - 1].date >= '2026-12-23').toBe(true);
  });

  it('orders Rhythms by day-of-week then by name', () => {
    const thuA = baseEvent({ id: 'thuA', name: 'Zebra', date: '2026-09-10', parentEventId: 'thuA' });
    const thuB = baseEvent({ id: 'thuB', name: 'Apple', date: '2026-09-10', parentEventId: 'thuB' });
    const wed = baseEvent({ id: 'wed', name: 'Wednesday', date: '2026-09-09', parentEventId: 'wed' });
    const m = buildGatheringViewModel({ events: [thuA, thuB, wed], contacts: [], now: NOW });
    expect(m.rhythms.map((r) => r.id)).toEqual(['wed', 'thuB', 'thuA']);
  });

  it('treats the first-of-series (parentEventId == self) as the rhythm anchor', () => {
    const first = baseEvent({ id: 'anchor', date: '2026-09-09', parentEventId: 'anchor' });
    const child = baseEvent({ id: 'child', date: '2026-09-16', parentEventId: 'anchor' });
    const m = buildGatheringViewModel({ events: [first, child], contacts: [], now: NOW });
    // Both should be chips under one rhythm whose id is the anchor.
    const rhythm = m.rhythms.find((r) => r.id === 'anchor')!;
    expect(rhythm.chips).toHaveLength(2);
    // No second rhythm is created for the child.
    expect(m.rhythms.filter((r) => r.id === 'child')).toHaveLength(0);
  });

  it('a Rhythm whose first Gathering has been deleted keeps its remaining children', () => {
    // No anchor record; only children whose parentEventId points at a missing parent.
    const child1 = baseEvent({ id: 'c1', date: '2026-09-16', parentEventId: 'ghost' });
    const child2 = baseEvent({ id: 'c2', date: '2026-09-23', parentEventId: 'ghost' });
    const m = buildGatheringViewModel({ events: [child1, child2], contacts: [], now: NOW });
    // They fall under a synthetic rhythm keyed by the missing parentEventId.
    const rhythm = m.rhythms.find((r) => r.id === 'ghost')!;
    expect(rhythm).toBeDefined();
    expect(rhythm.chips.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });
});

describe('buildGatheringViewModel — one-offs', () => {
  it('excludes one-off Gatherings from Rhythm grouping', () => {
    const oneOff = baseEvent({ id: 'bbq', name: 'Welcome BBQ', date: '2026-09-05' });
    const rhythm = baseEvent({ id: 'rhythm', date: '2026-09-09', parentEventId: 'rhythm' });
    const m = buildGatheringViewModel({ events: [oneOff, rhythm], contacts: [], now: NOW });
    expect(m.rhythms.map((r) => r.id)).toEqual(['rhythm']);
    expect(m.oneOffs.map((g) => g.id)).toEqual(['bbq']);
  });

  it('orders past one-offs newest-first', () => {
    const older = baseEvent({ id: 'older', date: '2026-08-30' });
    const newer = baseEvent({ id: 'newer', date: '2026-09-08' });
    const m = buildGatheringViewModel({ events: [older, newer], contacts: [], now: NOW });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['newer', 'older']);
  });

  it('excludes future one-offs (Story 20 — past-tense list)', () => {
    const past = baseEvent({ id: 'past', date: '2026-08-30' });
    const future = baseEvent({ id: 'future', date: '2026-09-15' });
    const m = buildGatheringViewModel({ events: [past, future], contacts: [], now: NOW });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['past']);
  });
 });

describe('buildGatheringViewModel — selection', () => {
  it('selects the current-week chip by default when one exists', () => {
    const past = baseEvent({ id: 'past', date: '2026-09-02', parentEventId: 'past' });
    const current = baseEvent({ id: 'cur', date: '2026-09-09', parentEventId: 'past' });
    const m = buildGatheringViewModel({ events: [past, current], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'past')!;
    expect(rhythm.selectedChipId).toBe('cur');
  });

  it('falls back to the most recent past chip when no current-week chip exists', () => {
    const older = baseEvent({ id: 'older', date: '2026-08-26', parentEventId: 'rhythm' });
    const newer = baseEvent({ id: 'newer', date: '2026-09-02', parentEventId: 'rhythm' });
    const future = baseEvent({ id: 'future', date: '2026-09-16', parentEventId: 'rhythm' });
    const m = buildGatheringViewModel({ events: [older, newer, future], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'rhythm')!;
    expect(rhythm.selectedChipId).toBe('newer');
  });

  it('falls back to the earliest future chip when there is no past or current chip', () => {
    const a = baseEvent({ id: 'a', date: '2026-09-16', parentEventId: 'rhythm' });
    const b = baseEvent({ id: 'b', date: '2026-09-23', parentEventId: 'rhythm' });
    const m = buildGatheringViewModel({ events: [a, b], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'rhythm')!;
    expect(rhythm.selectedChipId).toBe('a');
  });
});

describe('buildGatheringViewModel — expected count & present count', () => {
  it('expected = union of roster IDs across the term', () => {
    const a = baseEvent({ id: 'a', date: '2026-09-09', roster: ['c1', 'c2'], parentEventId: 'rhythm' });
    const b = baseEvent({ id: 'b', date: '2026-09-16', roster: ['c2', 'c3'], parentEventId: 'rhythm' });
    const m = buildGatheringViewModel({ events: [a, b], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'rhythm')!;
    expect(rhythm.expectedCount).toBe(3);
  });

  it('presentCount for a chip comes from Contact.attendance[eventId] === true', () => {
    const ev = baseEvent({ id: 'ev', date: '2026-09-09', parentEventId: 'rhythm' });
    const c1 = baseContact({ id: 'c1', attendance: { ev: true } });
    const c2 = baseContact({ id: 'c2', attendance: { ev: true } });
    const c3 = baseContact({ id: 'c3', attendance: { ev: 'absent' } });
    const m = buildGatheringViewModel({ events: [ev], contacts: [c1, c2, c3], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'rhythm')!;
    expect(rhythm.chips[0].presentCount).toBe(2);
  });
});

describe('buildGatheringViewModel — selected chip summary', () => {
  it('exposes the selected Gathering so the view can show its summary without re-deriving', () => {
    const ev = baseEvent({ id: 'ev', date: '2026-09-09', parentEventId: 'rhythm' });
    const m = buildGatheringViewModel({ events: [ev], contacts: [], now: NOW });
    const rhythm = m.rhythms.find((r) => r.id === 'rhythm')!;
    expect(rhythm.selectedChip?.id).toBe('ev');
    expect(rhythm.selectedChip?.name).toBe('Wednesday Bible Study');
  });
});