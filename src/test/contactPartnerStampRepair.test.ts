import { describe, it, expect } from 'vitest';
import {
  planContactPartnerStampRepair,
  type PartnerArrangement,
  type RepairContact,
} from '../lib/contactPartnerStampRepair';

// The production arrangement's own metadata, per #1039: five Fall 2026 pairs,
// created 2026-08-29 and last edited 2026-09-14. The two-week gap between them
// is the only genuinely undecidable window.
const arrangement: PartnerArrangement = {
  byTerm: {
    'Fall 2026': [['sam', 'bob']],
    'Spring 2026': [['sam', 'kim']],
  },
  createTime: '2026-08-29T21:16:00.000Z',
  updateTime: '2026-09-14T05:20:00.000Z',
  currentTerm: 'Fall 2026',
};

const contact = (over: Partial<RepairContact> = {}): RepairContact => ({
  id: 'c1',
  createdBy: 'sam',
  coCreators: ['bob'],
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const rowsFor = (c: RepairContact, arr = arrangement) =>
  planContactPartnerStampRepair([c], arr).rows;

describe('planContactPartnerStampRepair', () => {
  it('removes a stamp on a contact created before the arrangement existed', () => {
    const [row] = rowsFor(contact({ createdAt: '2026-08-15T00:00:00.000Z' }));
    expect(row.outcome).toBe('remove');
    expect(row.reason).toBe('before-arrangement');
    expect(row.candidate).toBe('bob');
    expect(row.anchor).toBe('sam');
    expect(row.term).toBe('Fall 2026');
  });

  it('keeps a stamp on a contact created after the arrangement last changed', () => {
    const [row] = rowsFor(contact({ createdAt: '2026-09-20T00:00:00.000Z' }));
    expect(row.outcome).toBe('keep');
    expect(row.reason).toBe('after-last-change');
  });

  it('asks about a contact created inside the undecidable window, and writes nothing', () => {
    const plan = planContactPartnerStampRepair(
      [contact({ createdAt: '2026-09-05T00:00:00.000Z' })],
      arrangement,
    );
    expect(plan.rows[0].outcome).toBe('ask');
    expect(plan.rows[0].reason).toBe('undecidable-window');
    expect(plan.writes).toEqual([]);
  });

  it('removes a past-term stamp when the pairing was never recorded for that term', () => {
    const [row] = rowsFor(
      contact({ id: 'c-old', coCreators: ['bob'], createdAt: '2026-04-01T00:00:00.000Z' }),
      // The arrangement already existed, so the Spring entry is what decides:
      // it pairs sam with kim, not with bob.
      { ...arrangement, createTime: '2026-01-05T00:00:00.000Z' },
    );
    expect(row.term).toBe('Spring 2026');
    expect(row.outcome).toBe('remove');
    expect(row.reason).toBe('past-term-not-paired');
  });

  it('keeps a past-term stamp when the pairing was recorded for that term', () => {
    const [row] = rowsFor(
      contact({ coCreators: ['kim'], createdAt: '2026-04-01T00:00:00.000Z' }),
      // The arrangement has existed since January, so a Spring contact could
      // have been stamped from the Spring pairing at creation.
      {
        ...arrangement,
        createTime: '2026-01-05T00:00:00.000Z',
        byTerm: { ...arrangement.byTerm, 'Fall 2026': [['sam', 'kim']] },
      },
    );
    expect(row.term).toBe('Spring 2026');
    expect(row.outcome).toBe('keep');
    expect(row.reason).toBe('past-term-paired');
  });

  it('removes a past-term stamp that predates the arrangement, recorded pairing or not', () => {
    const [row] = rowsFor(
      contact({ coCreators: ['kim'], createdAt: '2026-04-01T00:00:00.000Z' }),
      {
        ...arrangement,
        byTerm: { ...arrangement.byTerm, 'Fall 2026': [['sam', 'kim']] },
      },
    );
    // The Spring 2026 entry was itself written no earlier than createTime, so it
    // cannot vouch for a stamp made when the document did not exist.
    expect(row.outcome).toBe('remove');
    expect(row.reason).toBe('before-arrangement');
  });

  it('never makes a candidate of a collaborator who is not a current partner', () => {
    const plan = planContactPartnerStampRepair(
      [contact({ coCreators: ['deliberately-added'], createdAt: '2026-08-15T00:00:00.000Z' })],
      arrangement,
    );
    expect(plan.rows).toEqual([]);
    expect(plan.writes).toEqual([]);
  });

  it('never removes the creator or the adder', () => {
    const plan = planContactPartnerStampRepair(
      [
        contact({
          createdBy: 'sam',
          addedBy: 'bob',
          coCreators: ['sam', 'bob'],
          createdAt: '2026-08-15T00:00:00.000Z',
        }),
      ],
      arrangement,
    );
    expect(plan.rows).toEqual([]);
    expect(plan.writes).toEqual([]);
  });

  it('falls back to the adder as the anchor when there is no creator', () => {
    const [row] = rowsFor(
      contact({ createdBy: null, addedBy: 'sam', createdAt: '2026-08-15T00:00:00.000Z' }),
    );
    expect(row.anchor).toBe('sam');
    expect(row.outcome).toBe('remove');
  });

  it('recomputes the access list from the surviving ties in the same write', () => {
    const plan = planContactPartnerStampRepair(
      [
        contact({
          createdBy: 'sam',
          coCreators: ['bob', 'friend'],
          visibleTo: ['sam', 'bob', 'friend'],
          createdAt: '2026-08-15T00:00:00.000Z',
        }),
      ],
      arrangement,
    );
    expect(plan.writes).toEqual([
      {
        id: 'c1',
        removeCoCreators: ['bob'],
        coCreatorsTo: ['friend'],
        visibleToFrom: ['sam', 'bob', 'friend'],
        visibleToTo: ['sam', 'friend'],
      },
    ]);
  });

  it('is re-runnable: a repaired contact plans nothing on a second pass', () => {
    const plan = planContactPartnerStampRepair(
      [contact({ coCreators: [], createdAt: '2026-08-15T00:00:00.000Z' })],
      arrangement,
    );
    expect(plan.rows).toEqual([]);
    expect(plan.writes).toEqual([]);
  });

  it('asks when a contact carries no creation date to judge by', () => {
    const [row] = rowsFor(contact({ createdAt: null }));
    expect(row.outcome).toBe('ask');
    expect(row.reason).toBe('unknown-created-at');
    expect(row.term).toBe('');
  });

  it('groups the questions by pair and carries the pair and its date range', () => {
    const plan = planContactPartnerStampRepair(
      [
        contact({ id: 'a', createdAt: '2026-09-02T00:00:00.000Z' }),
        contact({ id: 'b', createdAt: '2026-09-11T00:00:00.000Z' }),
        contact({ id: 'c', createdBy: 'bob', coCreators: ['sam'], createdAt: '2026-09-06T00:00:00.000Z' }),
      ],
      arrangement,
    );
    expect(plan.askGroups).toEqual([
      {
        members: ['bob', 'sam'],
        contactCount: 3,
        from: '2026-09-02T00:00:00.000Z',
        to: '2026-09-11T00:00:00.000Z',
      },
    ]);
  });

  it('flags a row the backfill was the last writer of, without changing its outcome', () => {
    const plan = planContactPartnerStampRepair(
      [
        contact({
          createdAt: '2026-09-05T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
          updateTime: '2026-09-15T10:00:00.000Z',
        }),
      ],
      arrangement,
      { start: '2026-09-15T00:00:00.000Z', end: '2026-09-16T00:00:00.000Z' },
    );
    expect(plan.rows[0].scriptWritten).toBe(true);
    expect(plan.rows[0].outcome).toBe('ask');
  });

  it('does not flag a document a person wrote after the backfill window', () => {
    const plan = planContactPartnerStampRepair(
      [
        contact({
          createdAt: '2026-09-05T00:00:00.000Z',
          updatedAt: '2026-09-15T10:00:00.000Z',
          updateTime: '2026-09-15T10:00:00.000Z',
        }),
      ],
      arrangement,
      { start: '2026-09-15T00:00:00.000Z', end: '2026-09-16T00:00:00.000Z' },
    );
    expect(plan.rows[0].scriptWritten).toBe(false);
  });
});
