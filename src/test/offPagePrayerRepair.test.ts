import { describe, it, expect } from 'vitest';
import {
  planOffPagePrayerRepair,
  type OffPagePrayerInput,
  type PrayerActivity,
  type VisitPrayerLink,
} from '../lib/offPagePrayerRepair';

// The three write paths, as stored:
//   - prayer page      -> prayerPage: true (team)
//   - visit            -> prayerPage: true, linked from a visit (off-page)
//   - phone Pray sheet -> prayerPage: true, logs "added a prayer burden for"
//   - web contact tab  -> no prayerPage (off-page)
const prayer = (over: Partial<OffPagePrayerInput> = {}): OffPagePrayerInput => ({
  id: 'p1',
  contactId: 'c1',
  ...over,
});

const visitLink = (prayerId: string, prayerBurden?: string | null): VisitPrayerLink => ({
  prayerId,
  prayerBurden,
});

const addPrayerActivity = (contactId: string): PrayerActivity => ({
  action: 'added a prayer burden for',
  targetId: contactId,
  targetType: 'contact',
});

const plan = (
  prayers: OffPagePrayerInput[],
  visits: VisitPrayerLink[] = [],
  activities: PrayerActivity[] = [],
) => planOffPagePrayerRepair(prayers, visits, activities);

describe('planOffPagePrayerRepair', () => {
  it('writes a missing-flag prayer with no prayerPage stamp (web contact tab)', () => {
    const { rows, writes, asks } = plan([prayer()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('write');
    expect(rows[0].signal).toBe('no-prayer-page');
    expect(writes.map((r) => r.id)).toEqual(['p1']);
    expect(asks).toEqual([]);
  });

  it('skips a prayer-page prayer that carries prayerPage: true and no off-page evidence', () => {
    const { rows, writes } = plan([prayer({ prayerPage: true })]);
    expect(rows[0].outcome).toBe('skip');
    expect(rows[0].signal).toBe('prayer-page');
    expect(writes).toEqual([]);
  });

  it('skips a prayer already carrying teamPrayer, true or false', () => {
    const flagged = plan([prayer({ teamPrayer: true }), prayer({ id: 'p2', teamPrayer: false })]);
    expect(flagged.rows.map((r) => r.outcome)).toEqual(['skip', 'skip']);
    expect(flagged.rows.map((r) => r.signal)).toEqual(['already-flagged', 'already-flagged']);
    expect(flagged.writes).toEqual([]);

    // Idempotent: a repaired row (teamPrayer: false) is never re-planned.
    const repaired = plan([prayer({ prayerPage: true, teamPrayer: false })]);
    expect(repaired.writes).toEqual([]);
  });

  it('asks about a phone Pray sheet row: prayerPage true with an add-prayer activity', () => {
    const { rows, writes, asks } = plan(
      [prayer({ prayerPage: true })],
      [],
      [addPrayerActivity('c1')],
    );
    expect(rows[0].outcome).toBe('ask');
    expect(rows[0].signal).toBe('activity-only');
    expect(writes).toEqual([]);
    expect(asks.map((r) => r.id)).toEqual(['p1']);
  });

  it('writes a visit-originated prayer linked from a visit', () => {
    const { rows, writes } = plan(
      [prayer({ prayerPage: true })],
      [visitLink('p1', 'for her dad')],
    );
    expect(rows[0].outcome).toBe('write');
    expect(rows[0].signal).toBe('visit-link');
    expect(writes.map((r) => r.id)).toEqual(['p1']);
  });

  it('ignores a visit link to another prayer or a blank prayerId', () => {
    const { rows } = plan(
      [prayer({ prayerPage: true })],
      [visitLink('other', 'x'), { prayerId: null }, { prayerId: '' }],
    );
    expect(rows[0].outcome).toBe('skip');
  });

  it('only counts the add-prayer activity, not unrelated actions on the contact', () => {
    const { rows } = plan(
      [prayer({ prayerPage: true })],
      [],
      [{ action: 'visited', targetId: 'c1', targetType: 'contact' }],
    );
    expect(rows[0].outcome).toBe('skip');
    expect(rows[0].signal).toBe('prayer-page');
  });

  it('joins visits by prayer id, not by contact', () => {
    const { rows } = plan(
      [prayer({ id: 'p9', contactId: 'c9', prayerPage: true })],
      [visitLink('p9')],
    );
    expect(rows[0].signal).toBe('visit-link');
  });

  it('collects every row so the dry run can print the whole review', () => {
    const { rows } = plan(
      [prayer({ id: 'off-page' }), prayer({ id: 'team', prayerPage: true })],
      [],
      [],
    );
    expect(rows.map((r) => r.id)).toEqual(['off-page', 'team']);
  });
});
