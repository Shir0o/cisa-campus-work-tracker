import { describe, it, expect } from 'vitest';
import { planReachedAtBackfill } from '../lib/contactReachedAtBackfill';

const iso = (s: string) => new Date(s).toISOString();
const ms = (s: string) => new Date(s).getTime();

describe('planReachedAtBackfill (#1335)', () => {
  it('stamps a person reached by an interaction, however old, with its date', () => {
    const plan = planReachedAtBackfill({
      contacts: [{ id: 'c1' }],
      interactions: [{ contactId: 'c1', ms: ms('2024-02-03T10:00:00Z') }],
      gatherings: [],
    });
    expect(plan.rows).toEqual([{ id: 'c1', set: { reachedAt: iso('2024-02-03T10:00:00Z') } }]);
    expect(plan.undated).toEqual([]);
  });

  it('stamps a person marked present at a Gathering, with the newest reach', () => {
    const plan = planReachedAtBackfill({
      contacts: [{ id: 'c1' }, { id: 'c2' }],
      interactions: [{ contactId: 'c1', ms: ms('2024-02-03') }],
      gatherings: [
        { date: '2025-05-01', attendance: { present: ['c1', 'c2'] } },
        { date: '2025-06-01', attendance: { present: [], absent: ['c2'] } },
      ],
    });
    expect(plan.rows).toEqual([
      { id: 'c1', set: { reachedAt: iso('2025-05-01') } },
      { id: 'c2', set: { reachedAt: iso('2025-05-01') } },
    ]);
  });

  it('leaves alone people already stamped, people nobody reached, and people who signed up', () => {
    const plan = planReachedAtBackfill({
      contacts: [
        { id: 'stamped', reachedAt: '2026-01-01' },
        { id: 'never' },
        { id: 'signed-up', reachedAt: null },
      ],
      interactions: [{ contactId: 'stamped', ms: ms('2024-01-01') }],
      gatherings: [{ date: '2025-05-01', attendance: { present: [], absent: ['never'] } }],
    });
    expect(plan.rows).toEqual([]);
  });

  it('ignores reach recorded against a person who no longer exists', () => {
    const plan = planReachedAtBackfill({
      contacts: [],
      interactions: [{ contactId: 'gone', ms: ms('2024-01-01') }],
      gatherings: [],
    });
    expect(plan.rows).toEqual([]);
  });

  it('reports a reach it cannot date instead of inventing a date', () => {
    const plan = planReachedAtBackfill({
      contacts: [{ id: 'c1' }],
      interactions: [],
      gatherings: [{ date: 'someday', attendance: { present: ['c1'] } }],
    });
    expect(plan.rows).toEqual([]);
    expect(plan.undated).toEqual(['c1']);
  });
});
