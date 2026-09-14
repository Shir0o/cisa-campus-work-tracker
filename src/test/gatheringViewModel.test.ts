import { describe, it, expect } from 'vitest';
import { buildGatheringViewModel, startOfWeekMonday, endOfWeekSunday, type ChipState } from '../lib/gatheringViewModel';
import type { Gathering, Rhythm } from '../types';

// Fixed Wednesday 2026-09-09 so tests are deterministic. 09-09 is mid-week:
// Mon 2026-09-07 → Sun 2026-09-13. Tuesday is the day before, Monday is two days before.
const NOW = new Date('2026-09-09T14:00:00');

const baseEvent = (overrides: Partial<Gathering> & { id: string }): Gathering => ({
  name: 'Wednesday Bible Study',
  date: '2026-09-09',
  order: 0,
  createdAt: '2026-09-01T00:00:00Z',
  ...overrides,
});

const baseRhythm = (overrides: Partial<Rhythm> & { id: string }): Rhythm => ({
  name: 'Wednesday Bible Study',
  cadence: { type: 'weekly', days: [3] },
  roster: [],
  termStart: '2026-09-09',
  termEnd: '2026-12-23',
  createdAt: '2026-09-01T00:00:00Z',
  createdById: 'u1',
  ...overrides,
});


const localYmd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const build = (opts: { events?: Gathering[]; rhythms?: Rhythm[]; now?: Date }) =>
  buildGatheringViewModel({
    events: opts.events ?? [],
    rhythms: opts.rhythms ?? [],
    now: opts.now ?? NOW,
  });

describe('startOfWeekMonday / endOfWeekSunday', () => {
  it('returns Monday for a Wednesday', () => {
    const monday = startOfWeekMonday(new Date('2026-09-09T14:00:00'));
    expect(monday.getDay()).toBe(1);
    expect(localYmd(monday)).toBe('2026-09-07');
  });
  it('returns Sunday for a Wednesday, inclusive end-of-day', () => {
    const sunday = endOfWeekSunday(new Date('2026-09-09T14:00:00'));
    expect(sunday.getDay()).toBe(0);
    expect(localYmd(sunday)).toBe('2026-09-13');
  });
});

describe('buildGatheringViewModel — week bounds', () => {
  it('puts a Sunday-evening Gathering in the current Monday–Sunday week', () => {
    const sundayEvent = baseEvent({ id: 'sun', name: 'Sunday Gathering', date: '2026-09-13' });
    const m = build({ events: [sundayEvent] });
    expect(m.thisWeek.some((g) => g.gatherings.some((ev) => ev.id === 'sun'))).toBe(true);
  });

  it('puts the next day (Monday 09-14) in the next week, not this one', () => {
    const monNext = baseEvent({ id: 'next-mon', name: 'Next Monday', date: '2026-09-14' });
    const m = build({ events: [monNext] });
    expect(m.thisWeek.some((g) => g.gatherings.some((ev) => ev.id === 'next-mon'))).toBe(false);
    expect(m.oneOffs.find((g) => g.id === 'next-mon')).toBeUndefined();
    // Future one-offs surface separately (Story 36).
    expect(m.upcomingOneOffs.find((g) => g.id === 'next-mon')).toBeDefined();
  });
});

describe('buildGatheringViewModel — this-week grouping', () => {
  it('groups two Gatherings on one day under a single date heading', () => {
    const thuA = baseEvent({ id: 'thuA', name: 'Bible Study', date: '2026-09-10' });
    const thuB = baseEvent({ id: 'thuB', name: 'College Meeting', date: '2026-09-10' });
    const m = build({ events: [thuA, thuB] });
    expect(m.thisWeek.length).toBe(1);
    expect(m.thisWeek[0].date).toBe('2026-09-10');
    expect(m.thisWeek[0].gatherings.map((g) => g.id).sort()).toEqual(['thuA', 'thuB']);
  });

  it('says so plainly when a week has no Gatherings', () => {
    const m = build({});
    expect(m.thisWeekEmpty).toBe(true);
  });
});

describe('buildGatheringViewModel — chip state', () => {
  it('marks a past Gathering as taken when an attendance record exists', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const past = baseEvent({
      id: 'past-taken',
      date: '2026-09-02',
      rhythmId: 'r1',
      attendance: { present: ['c1'], absent: [] },
    });
    const m = build({ events: [past], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    const chip = row.chips.find((c) => c.id === 'past-taken')!;
    expect(chip.state).toBe<ChipState>('taken');
  });

  it('marks a past Gathering as happened-not-taken when the stamp is absent', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const past = baseEvent({ id: 'past-empty', date: '2026-09-02', rhythmId: 'r1' });
    const m = build({ events: [past], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips[0].state).toBe<ChipState>('happened-not-taken');
  });

  it('marks a Gathering in the current week distinctly', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const current = baseEvent({ id: 'cur', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [current], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips[0].state).toBe<ChipState>('current-week');
  });

  it('marks a Gathering in a future week as ahead and faint', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const future = baseEvent({ id: 'fut', date: '2026-10-07', rhythmId: 'r1' });
    const m = build({ events: [future], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips[0].faint).toBe(true);
  });

  it('does NOT mark a future Gathering as taken just because a record exists', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const future = baseEvent({ id: 'fut-stamped', date: '2026-10-07', rhythmId: 'r1', attendance: { present: ['c1'], absent: [] } });
    const m = build({ events: [future], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips[0].state).toBe<ChipState>('ahead');
  });

  it('marks a cancelled Gathering as cancelled regardless of week position', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const cancelledPast = baseEvent({ id: 'c1', date: '2026-08-05', rhythmId: 'r1', cancelled: true });
    const cancelledFuture = baseEvent({ id: 'c2', date: '2026-11-11', rhythmId: 'r1', cancelled: true });
    const m = build({ events: [cancelledPast, cancelledFuture], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips.find((c) => c.id === 'c1')?.state).toBe<ChipState>('cancelled');
    expect(row.chips.find((c) => c.id === 'c2')?.state).toBe<ChipState>('cancelled');
  });
});

describe('buildGatheringViewModel — Rhythm rows come directly from Rhythm docs', () => {
  it('builds one row per Rhythm even with zero occasions generated yet', () => {
    const rhythm = baseRhythm({ id: 'r1', name: 'New Rhythm' });
    const m = build({ rhythms: [rhythm] });
    expect(m.rhythms).toHaveLength(1);
    expect(m.rhythms[0].id).toBe('r1');
    expect(m.rhythms[0].chips).toHaveLength(0);
  });

  it('a Rhythm row\'s chips are its own events filtered by rhythmId, ordered by date', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const w2 = baseEvent({ id: 'w2', date: '2026-09-16', rhythmId: 'r1' });
    const w1 = baseEvent({ id: 'w1', date: '2026-09-09', rhythmId: 'r1' });
    const other = baseEvent({ id: 'other', date: '2026-09-09', rhythmId: 'r2' });
    const m = build({ events: [w2, w1, other], rhythms: [rhythm, baseRhythm({ id: 'r2' })] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips.map((c) => c.id)).toEqual(['w1', 'w2']);
  });

  it('orders Rhythms by cadence day-of-week then by name', () => {
    const thuA = baseRhythm({ id: 'thuA', name: 'Zebra', cadence: { type: 'weekly', days: [4] } });
    const thuB = baseRhythm({ id: 'thuB', name: 'Apple', cadence: { type: 'weekly', days: [4] } });
    const wed = baseRhythm({ id: 'wed', name: 'Wednesday', cadence: { type: 'weekly', days: [3] } });
    const m = build({ rhythms: [thuA, thuB, wed] });
    expect(m.rhythms.map((r) => r.id)).toEqual(['wed', 'thuB', 'thuA']);
  });

  it('includes cadence text and location in the row subtitle (Story 31)', () => {
    const rhythm = baseRhythm({ id: 'r1', cadence: { type: 'weekly', days: [3] }, location: 'Lower Common Room' });
    const m = build({ rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.subtitle).toContain('Wednesday');
    expect(row.subtitle).toContain('Lower Common Room');
  });
});

describe('buildGatheringViewModel — one-offs', () => {
  it('excludes Rhythm-linked Gatherings from one-offs', () => {
    const oneOff = baseEvent({ id: 'bbq', name: 'Welcome BBQ', date: '2026-09-05' });
    const rhythm = baseRhythm({ id: 'r1' });
    const linked = baseEvent({ id: 'linked', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [oneOff, linked], rhythms: [rhythm] });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['bbq']);
  });

  it('orders past one-offs newest-first', () => {
    const older = baseEvent({ id: 'older', date: '2026-08-30' });
    const newer = baseEvent({ id: 'newer', date: '2026-09-08' });
    const m = build({ events: [older, newer] });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['newer', 'older']);
  });

  it('excludes future one-offs from oneOffs and puts them in upcomingOneOffs (Story 20/36)', () => {
    const past = baseEvent({ id: 'past', date: '2026-08-30' });
    const future = baseEvent({ id: 'future', date: '2026-09-15' });
    const m = build({ events: [past, future] });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['past']);
    expect(m.upcomingOneOffs.map((g) => g.id)).toEqual(['future']);
  });
});

describe('buildGatheringViewModel — selection', () => {
  it('selects the current-week chip by default when one exists', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const past = baseEvent({ id: 'past', date: '2026-09-02', rhythmId: 'r1' });
    const current = baseEvent({ id: 'cur', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [past, current], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.selectedChipId).toBe('cur');
  });

  it('falls back to the most recent past chip when no current-week chip exists', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const older = baseEvent({ id: 'older', date: '2026-08-26', rhythmId: 'r1' });
    const newer = baseEvent({ id: 'newer', date: '2026-09-02', rhythmId: 'r1' });
    const future = baseEvent({ id: 'future', date: '2026-09-16', rhythmId: 'r1' });
    const m = build({ events: [older, newer, future], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.selectedChipId).toBe('newer');
  });

  it('falls back to the earliest future chip when there is no past or current chip', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const a = baseEvent({ id: 'a', date: '2026-09-16', rhythmId: 'r1' });
    const b = baseEvent({ id: 'b', date: '2026-09-23', rhythmId: 'r1' });
    const m = build({ events: [a, b], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.selectedChipId).toBe('a');
  });
});

describe('buildGatheringViewModel — expected count & present count', () => {
  it('expectedCount comes from resolveRoster for the selected chip (live from rhythm.roster today/future)', () => {
    const rhythm = baseRhythm({ id: 'r1', roster: ['c1', 'c2', 'c3'] });
    const current = baseEvent({ id: 'cur', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [current], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.expectedCount).toBe(3);
  });

  it('expectedCount is frozen to the recorded roster for a past chip', () => {
    const rhythm = baseRhythm({ id: 'r1', roster: ['c1', 'c2', 'c3'] });
    const past = baseEvent({ id: 'past', date: '2026-09-02', rhythmId: 'r1', roster: ['c1'] });
    const m = build({ events: [past], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips[0].expectedCount).toBe(1);
  });

  it('presentCount for a chip comes from the Gathering attendance record', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const ev = baseEvent({ id: 'ev', date: '2026-09-09', rhythmId: 'r1', attendance: { present: ['c1', 'c2'], absent: ['c3'] } });
    const m = build({ events: [ev], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.chips[0].presentCount).toBe(2);
  });
});

describe('buildGatheringViewModel — selected chip summary', () => {
  it('exposes the selected Gathering so the view can show its summary without re-deriving', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const ev = baseEvent({ id: 'ev', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [ev], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1')!;
    expect(row.selectedChip?.id).toBe('ev');
  });
});

describe('buildGatheringViewModel - Rhythm name reads through (story 9)', () => {
  it('uses the Rhythm name for a linked week even when the stored event name is stale', () => {
    const rhythm = baseRhythm({ id: 'r1', name: 'Wednesday Bible Study' });
    const stale = baseEvent({ id: 'w', date: '2026-09-09', rhythmId: 'r1', name: 'Old Name' });
    const m = build({ events: [stale], rhythms: [rhythm] });
    const week = m.thisWeek[0].gatherings[0];
    expect(week.name).toBe('Wednesday Bible Study');
    expect(m.rhythms[0].chips[0].name).toBe('Wednesday Bible Study');
  });

  it('falls back to the Rhythm location, but an occasion keeps where it actually met', () => {
    const rhythm = baseRhythm({ id: 'r1', location: 'Lower Common Room' });
    const usual = baseEvent({ id: 'usual', date: '2026-09-09', rhythmId: 'r1' });
    const moved = baseEvent({ id: 'moved', date: '2026-09-10', rhythmId: 'r1', location: 'Chapel' });
    const m = build({ events: [usual, moved], rhythms: [rhythm] });
    const byId = new Map(m.thisWeek.flatMap((g) => g.gatherings.map((e) => [e.id, e])));
    expect(byId.get('usual')?.subtitle).toBe('Lower Common Room');
    expect(byId.get('moved')?.subtitle).toBe('Chapel');
  });

  it('resolves the week band expected count from the Rhythm roster', () => {
    const rhythm = baseRhythm({ id: 'r1', roster: ['c1', 'c2', 'c3'] });
    const ev = baseEvent({ id: 'w', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [ev], rhythms: [rhythm] });
    expect(m.thisWeek[0].gatherings[0].expectedCount).toBe(3);
  });
});

describe('buildGatheringViewModel - default selection and cancellations', () => {
  it('ignores a future cancelled chip when picking the most recent past', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const past = baseEvent({ id: 'past', date: '2026-09-02', rhythmId: 'r1' });
    const futureCancelled = baseEvent({ id: 'cancelled', date: '2026-11-11', rhythmId: 'r1', cancelled: true });
    const m = build({ events: [past, futureCancelled], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1');
    expect(row?.selectedChipId).toBe('past');
  });

  it('picks the earliest future chip over a later cancelled one', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const future = baseEvent({ id: 'future', date: '2026-09-16', rhythmId: 'r1' });
    const futureCancelled = baseEvent({ id: 'cancelled', date: '2026-11-11', rhythmId: 'r1', cancelled: true });
    const m = build({ events: [future, futureCancelled], rhythms: [rhythm] });
    const row = m.rhythms.find((r) => r.id === 'r1');
    expect(row?.selectedChipId).toBe('future');
  });
});

// ── Orphaned occasions (issue issue 982) ────────────────────────────────────────
// A Gathering whose `rhythmId` names no live Rhythm must still reach the page.
// The one-off partition used to be "no rhythmId at all", so a removed Rhythm —
// whether removed in-app or by hand in the console — hid every occasion it had
// generated while those occasions still counted toward the page's headline.
describe('buildGatheringViewModel — occasions orphaned by a missing Rhythm', () => {
  it('lists an occasion whose Rhythm is gone among the one-offs', () => {
    const orphan = baseEvent({ id: 'orphan', date: '2026-09-02', rhythmId: 'deleted' });
    const m = build({ events: [orphan], rhythms: [] });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['orphan']);
  });

  it('reads an orphan\'s own name and room, since no Rhythm can supply them', () => {
    const orphan = baseEvent({
      id: 'orphan',
      name: 'Wednesday Bible Study',
      location: 'Cypress Hall',
      date: '2026-09-02',
      rhythmId: 'deleted',
    });
    const m = build({ events: [orphan], rhythms: [] });
    expect(m.oneOffs[0]).toMatchObject({ name: 'Wednesday Bible Study', subtitle: 'Cypress Hall' });
  });

  it('sorts an orphan into past or upcoming one-offs by its date, like any other', () => {
    const pastOrphan = baseEvent({ id: 'past', date: '2026-08-26', rhythmId: 'deleted' });
    const futureOrphan = baseEvent({ id: 'future', date: '2026-09-16', rhythmId: 'deleted' });
    const m = build({ events: [pastOrphan, futureOrphan], rhythms: [] });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['past']);
    expect(m.upcomingOneOffs.map((g) => g.id)).toEqual(['future']);
  });

  it('counts who came to an orphan against the roster frozen on the occasion', () => {
    const orphan = baseEvent({
      id: 'orphan',
      date: '2026-09-02',
      rhythmId: 'deleted',
      roster: ['c1', 'c2'],
      attendance: { present: ['c1'], absent: [] },
    });
    const m = build({ events: [orphan], rhythms: [] });
    expect(m.oneOffs[0]).toMatchObject({ presentCount: 1, expectedCount: 2 });
  });

  it('still builds no Rhythm row for a Rhythm that is gone', () => {
    const orphan = baseEvent({ id: 'orphan', date: '2026-09-02', rhythmId: 'deleted' });
    const m = build({ events: [orphan], rhythms: [] });
    expect(m.rhythms).toEqual([]);
  });

  it('keeps a live Rhythm\'s occasions out of the one-offs', () => {
    const rhythm = baseRhythm({ id: 'r1' });
    const linked = baseEvent({ id: 'linked', date: '2026-09-02', rhythmId: 'r1' });
    const orphan = baseEvent({ id: 'orphan', date: '2026-09-02', rhythmId: 'deleted' });
    const m = build({ events: [linked, orphan], rhythms: [rhythm] });
    expect(m.oneOffs.map((g) => g.id)).toEqual(['orphan']);
    expect(m.rhythms[0].chips.map((c) => c.id)).toEqual(['linked']);
  });

  it('shows an orphan falling in the current week in the This-week band', () => {
    const orphan = baseEvent({ id: 'orphan', date: '2026-09-09', rhythmId: 'deleted' });
    const m = build({ events: [orphan], rhythms: [] });
    expect(m.thisWeekEmpty).toBe(false);
    expect(m.thisWeek[0].gatherings.map((g) => g.id)).toEqual(['orphan']);
  });
});

// ── Row subtitle (issue issue 982) ──────────────────────────────────────────────
// Every roomless row rendered the same placeholder, so rows read as duplicates.
// The view model now supplies what it knows; the view keeps the last-resort
// phrase because that string is translated copy, which the model does not hold.
describe('buildGatheringViewModel — occasion subtitle', () => {
  it('prefers the room a Gathering met in', () => {
    const rhythm = baseRhythm({ id: 'r1', location: 'Cypress Hall' });
    const ev = baseEvent({ id: 'e1', date: '2026-09-09', rhythmId: 'r1', location: 'Room 204' });
    const m = build({ events: [ev], rhythms: [rhythm] });
    expect(m.thisWeek[0].gatherings[0].subtitle).toBe('Room 204');
  });

  it('falls back to the Rhythm\'s usual room when the occasion did not move', () => {
    const rhythm = baseRhythm({ id: 'r1', location: 'Cypress Hall' });
    const ev = baseEvent({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [ev], rhythms: [rhythm] });
    expect(m.thisWeek[0].gatherings[0].subtitle).toBe('Cypress Hall');
  });

  it('falls back to the cadence when a Rhythm-linked occasion has no room at all', () => {
    const rhythm = baseRhythm({ id: 'r1', cadence: { type: 'weekly', days: [3] } });
    const ev = baseEvent({ id: 'e1', date: '2026-09-09', rhythmId: 'r1' });
    const m = build({ events: [ev], rhythms: [rhythm] });
    expect(m.thisWeek[0].gatherings[0].subtitle).toBe('Every Wednesday');
  });

  it('leaves the subtitle empty for a roomless one-off, so the view can say its piece', () => {
    const ev = baseEvent({ id: 'bbq', name: 'Welcome BBQ', date: '2026-09-05' });
    const m = build({ events: [ev] });
    expect(m.oneOffs[0].subtitle).toBeUndefined();
  });
});
