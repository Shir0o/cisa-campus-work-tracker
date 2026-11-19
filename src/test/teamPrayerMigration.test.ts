// §21: team prayer became per person. The one-off migration keeps "On our
// hearts" looking the same by lifting the old per-prayer flag onto the contact.
// The planner is pure so the decision is tested without Firestore.
import { describe, it, expect } from 'vitest';
import { planTeamPrayerMigration } from '../lib/teamPrayerMigration';
import { legacyContact, noOwnerContact } from './fixtures/contacts';

const prayer = (contactId: string, teamPrayer?: boolean) => ({ contactId, teamPrayer });

describe('planTeamPrayerMigration', () => {
  it('puts a person on team prayer when one of their prayers was on the page', () => {
    const contact = legacyContact({ id: 'c1', name: 'Alice Johnson' });
    expect(planTeamPrayerMigration([contact], [prayer('c1', true)])).toEqual([
      { id: 'c1', teamPrayer: true },
    ]);
  });

  // A prayer written before the phone toggle existed carries no flag, and it
  // was on the team page — so the migration must read it as the team's.
  it('counts a flagless prayer as the team’s', () => {
    expect(planTeamPrayerMigration([noOwnerContact], [prayer(noOwnerContact.id)])).toEqual([
      { id: noOwnerContact.id, teamPrayer: true },
    ]);
  });

  it('leaves a person whose prayers were all kept private unchanged', () => {
    const contact = legacyContact({ id: 'c2', name: 'Bob Smith' });
    expect(planTeamPrayerMigration([contact], [prayer('c2', false)])).toEqual([]);
    expect(planTeamPrayerMigration([contact], [])).toEqual([]);
  });

  // Fix round 1: a removed person is skipped entirely — the migration never
  // writes `false`, so a re-run can never take someone off for the team.
  it('skips a person the team removed from the list', () => {
    const removed = legacyContact({
      id: 'c3',
      name: 'Carol Lee',
      prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'u-admin' },
    });
    expect(planTeamPrayerMigration([removed], [prayer('c3', true)])).toEqual([]);
  });

  it('only ever writes true', () => {
    const contact = legacyContact({ id: 'c2b', name: 'Nia Cole' });
    const plan = planTeamPrayerMigration([contact], [prayer('c2b')]);
    expect(plan).toEqual([{ id: 'c2b', teamPrayer: true }]);
  });

  it('is idempotent once the contact carries the answer', () => {
    const on = legacyContact({ id: 'c4', name: 'Dan Reed', teamPrayer: true });
    expect(planTeamPrayerMigration([on], [prayer('c4', true)])).toEqual([]);

    const off = legacyContact({ id: 'c5', name: 'Eve Park', teamPrayer: false });
    expect(planTeamPrayerMigration([off], [prayer('c5', false)])).toEqual([]);

    const removedOff = legacyContact({
      id: 'c5b',
      name: 'Eve Again',
      teamPrayer: false,
      prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'u-admin' },
    });
    expect(planTeamPrayerMigration([removedOff], [prayer('c5b')])).toEqual([]);
  });

  it('ignores prayers belonging to another person', () => {
    const contact = legacyContact({ id: 'c7', name: 'Grace Ito' });
    expect(planTeamPrayerMigration([contact], [prayer('someone-else', true)])).toEqual([]);
  });
});
