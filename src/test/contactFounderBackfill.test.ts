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

  it('lists a current-term contact the supplied answers cannot place as unresolved, writing nothing', () => {
    // The current term's pre-re-pairing arrangement was destroyed, so "alone"
    // cannot be asserted from a bare settings read. Never guess.
    const plan = planContactFounderBackfill(
      [contact({ id: 'c1', createdBy: 'a', createdAt: '2026-09-05T12:00:00.000Z' })],
      [P('1', ['a', 'b'], '2026-08-01')],
      [S(['a', 'b'], '2026-09-10')],
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
});