import { describe, it, expect } from 'vitest';
import {
  planContactFounderBackfill,
  type PartnerPairing,
  type SuppliedPairing,
} from '../lib/contactFounderBackfill';

const P = (id: string, members: string[], startDate: string, endDate?: string): PartnerPairing => ({
  id,
  members,
  startDate,
  ...(endDate ? { endDate } : {}),
});

const S = (members: string[], startDate: string): SuppliedPairing => ({ members, startDate });

// Sept 2026 -> "Fall 2026" is the live term. Contacts in it are resolved by the
// supplied pairing-start answers from #1039; earlier terms by the dated history.
const NOW = new Date(2026, 8, 15);

const contact = (over: Partial<Parameters<typeof planContactFounderBackfill>[0][number]> = {}) => ({
  id: 'c1',
  createdBy: 'a',
  createdAt: '2026-06-15T12:00:00.000Z',
  ...over,
});

describe('planContactFounderBackfill (#1050 migration)', () => {
  it('resolves a past-term contact created inside a recorded pairing to creator plus partner', () => {
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-06-15T12:00:00.000Z' })],
      [P('1', ['a', 'b'], '2026-06-01')],
      [],
      NOW,
    );
    expect(plan.rows).toEqual([
      {
        contactId: 'c1',
        anchor: 'a',
        createdAt: '2026-06-15',
        founders: ['a', 'b'],
        outcome: 'resolved',
        reason: 'past-term-paired',
      },
    ]);
    expect(plan.writes).toEqual([
      {
        id: 'c1',
        foundersTo: ['a', 'b'],
        visibleToFrom: [],
        visibleToTo: ['a', 'b'],
      },
    ]);
  });

  it('carries only the creator when a past-term contact was created outside any pairing', () => {
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-06-15T12:00:00.000Z' })],
      [P('1', ['a', 'b'], '2026-06-01', '2026-06-10')],
      [],
      NOW,
    );
    expect(plan.rows[0].founders).toEqual(['a']);
    expect(plan.rows[0].reason).toBe('past-term-alone');
    expect(plan.writes).toEqual([
      {
        id: 'c1',
        foundersTo: ['a'],
        visibleToFrom: [],
        visibleToTo: ['a'],
      },
    ]);
  });

  it('resolves a current-term contact with the pairing-start answer from #1039', () => {
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-12T12:00:00.000Z' })],
      [],
      [S(['a', 'b'], '2026-09-10')],
      NOW,
    );
    expect(plan.rows[0].founders).toEqual(['a', 'b']);
    expect(plan.rows[0].outcome).toBe('resolved');
    expect(plan.rows[0].reason).toBe('current-term-paired');
  });

  it('resolves a current-term contact no supplied pairing places as founded alone', () => {
    // The answers are the COMPLETE live-term arrangement, so an anchor they do
    // not place was not paired - not an open question (#1050).
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-05T12:00:00.000Z' })],
      [P('1', ['a', 'b'], '2026-08-01')],
      [S(['x', 'y'], '2026-08-01')],
      NOW,
    );
    expect(plan.rows).toEqual([
      {
        contactId: 'c1',
        anchor: 'a',
        createdAt: '2026-09-05',
        founders: ['a'],
        outcome: 'resolved',
        reason: 'current-term-alone',
      },
    ]);
    expect(plan.writes).toEqual([
      {
        id: 'c1',
        foundersTo: ['a'],
        visibleToFrom: [],
        visibleToTo: ['a'],
      },
    ]);
  });

  it('resolves a current-term contact a supplied pairing does place to creator plus partner', () => {
    // The completeness premise must not swallow the pairings that ARE supplied:
    // an anchor the answers place still carries its partner.
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-05T12:00:00.000Z' })],
      [],
      [S(['a', 'b'], '2026-08-01'), S(['x', 'y'], '2026-08-01')],
      NOW,
    );
    expect(plan.rows[0]).toEqual({
      contactId: 'c1',
      anchor: 'a',
      createdAt: '2026-09-05',
      founders: ['a', 'b'],
      outcome: 'resolved',
      reason: 'current-term-paired',
    });
    expect(plan.writes[0].foundersTo).toEqual(['a', 'b']);
  });

  it('still falls outside a supplied pairing that had not started on the creation day', () => {
    // "Complete" means the set of pairings, not that every pairing covers every
    // day: a contact made before its anchor's pairing began is founded alone.
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-05T12:00:00.000Z' })],
      [],
      [S(['a', 'b'], '2026-09-10')],
      NOW,
    );
    expect(plan.rows[0].founders).toEqual(['a']);
    expect(plan.rows[0].reason).toBe('current-term-alone');
  });

  it('leaves current-term contacts unresolved when no answers are supplied at all', () => {
    // Nothing asserts the live term, and the mid-term re-pairing destroyed the
    // arrangement (#1039), so "alone" cannot be concluded from silence.
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-05T12:00:00.000Z' })],
      [P('1', ['a', 'b'], '2026-08-01')],
      [],
      NOW,
    );
    expect(plan.rows).toEqual([
      {
        contactId: 'c1',
        anchor: 'a',
        createdAt: '2026-09-05',
        founders: [],
        outcome: 'unresolved',
        reason: 'current-term-unresolved',
      },
    ]);
    expect(plan.writes).toEqual([]);
  });

  it('treats an answers file with no usable record as no answers at all', () => {
    // A file of junk asserts nothing, so it must not license "founded alone".
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-05T12:00:00.000Z' })],
      [],
      [S(['a'], '2026-08-01'), S(['a', 'b'], 'not-a-date')],
      NOW,
    );
    expect(plan.rows[0].outcome).toBe('unresolved');
    expect(plan.rows[0].reason).toBe('current-term-unresolved');
    expect(plan.writes).toEqual([]);
  });

  it('leaves past-term classification untouched when live-term answers are supplied', () => {
    // The completeness premise governs the live term only: a past term still
    // reads from its own surviving dated history.
    const plan = planContactFounderBackfill(
      [
        contact({ id: 'past-paired', createdBy: 'a', createdAt: '2026-06-15T12:00:00.000Z' }),
        contact({ id: 'past-alone', createdBy: 'c', createdAt: '2026-06-15T12:00:00.000Z' }),
      ],
      [P('1', ['a', 'b'], '2026-06-01')],
      [S(['c', 'd'], '2026-08-01')],
      NOW,
    );
    expect(plan.rows.map((r) => [r.contactId, r.founders, r.reason])).toEqual([
      ['past-paired', ['a', 'b'], 'past-term-paired'],
      // 'c' is paired in the LIVE term only - that must not reach June.
      ['past-alone', ['c'], 'past-term-alone'],
    ]);
  });

  it('lists a contact with no anchor as unresolved and writes nothing', () => {
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: null, createdAt: '2026-06-15T12:00:00.000Z' })],
      [],
      [],
      NOW,
    );
    expect(plan.rows).toEqual([
      {
        contactId: 'c1',
        anchor: '',
        createdAt: '2026-06-15',
        founders: [],
        outcome: 'unresolved',
        reason: 'no-anchor',
      },
    ]);
    expect(plan.writes).toEqual([]);
  });

  it('lists a contact with no usable creation date as unresolved and writes nothing', () => {
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: null })],
      [],
      [],
      NOW,
    );
    expect(plan.rows).toEqual([
      {
        contactId: 'c1',
        anchor: 'a',
        createdAt: '',
        founders: [],
        outcome: 'unresolved',
        reason: 'no-creation-date',
      },
    ]);
    expect(plan.writes).toEqual([]);
  });

  it('recomputes visibleTo from the surviving ties in the same write as the founders', () => {
    const plan = planContactFounderBackfill(
      [
        contact({
          id: 'c1',
          createdBy: 'a',
          createdAt: '2026-06-15T12:00:00.000Z',
          coCreators: ['c'],
          visibleTo: ['a', 'b', 'd'],
        }),
      ],
      [P('1', ['a', 'b'], '2026-06-01')],
      [],
      NOW,
    );
    expect(plan.writes[0]).toEqual({
      id: 'c1',
      foundersTo: ['a', 'b'],
      visibleToFrom: ['a', 'b', 'd'],
      visibleToTo: ['a', 'c', 'b'],
    });
  });

  it('is idempotent: a contact that already carries founders is skipped on a re-run', () => {
    const already = contact({ id: 'c1', createdBy: 'a', createdAt: '2026-06-15T12:00:00.000Z', founders: ['a', 'b'] });
    const plan = planContactFounderBackfill([already], [P('1', ['a', 'b'], '2026-06-01')], [], NOW);
    expect(plan.rows).toEqual([]);
    expect(plan.writes).toEqual([]);
  });

  it('is idempotent across the new alone branch: the second run has nothing left to do', () => {
    // A contact resolved as founded alone carries founders: [anchor] - an array,
    // so the re-run skips it rather than stamping it again.
    const contacts = [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-05T12:00:00.000Z' })];
    const answers = [S(['x', 'y'], '2026-08-01')];

    const first = planContactFounderBackfill(contacts, [], answers, NOW);
    expect(first.writes).toHaveLength(1);

    const after = contacts.map((c) => ({ ...c, founders: first.writes[0].foundersTo }));
    const second = planContactFounderBackfill(after, [], answers, NOW);
    expect(second.rows).toEqual([]);
    expect(second.writes).toEqual([]);
  });

  it('leaves a non-uid anchor to the same rules as any other (#1050 scope)', () => {
    // A GroupMe-style anchor has never been special-cased here, and this change
    // does not start: settings/partners stores member uids, so no pairing can
    // ever place one. It is founded alone - which is exactly what a past-term
    // GroupMe contact already gets today (past-term-alone).
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'groupme-43626384', createdAt: '2026-09-05T12:00:00.000Z' })],
      [],
      [S(['a', 'b'], '2026-08-01')],
      NOW,
    );
    expect(plan.rows[0].founders).toEqual(['groupme-43626384']);
    expect(plan.rows[0].reason).toBe('current-term-alone');
  });
});