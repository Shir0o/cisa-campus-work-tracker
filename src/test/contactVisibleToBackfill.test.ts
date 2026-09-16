import { describe, it, expect } from 'vitest';
import { planContactVisibleToBackfill } from '../lib/contactVisibleToBackfill';

describe('planContactVisibleToBackfill', () => {
  it('plans a write when visibleTo is missing', () => {
    const rows = planContactVisibleToBackfill([
      { id: 'c1', createdBy: 'u1', coCreators: ['u2', 'u3'] },
    ]);
    expect(rows).toEqual([{ id: 'c1', from: [], to: ['u1', 'u2', 'u3'] }]);
  });

  it('is idempotent: an already-correct list is skipped', () => {
    const rows = planContactVisibleToBackfill([
      { id: 'c1', createdBy: 'u1', coCreators: ['u2'], visibleTo: ['u1', 'u2'] },
    ]);
    expect(rows).toEqual([]);
  });

  it('does not care about ordering in the stored list', () => {
    const rows = planContactVisibleToBackfill([
      { id: 'c1', createdBy: 'u1', coCreators: ['u2'], visibleTo: ['u2', 'u1'] },
    ]);
    expect(rows).toEqual([]);
  });

  it('rewrites a stale list that dropped a tie', () => {
    const rows = planContactVisibleToBackfill([
      { id: 'c1', createdBy: 'u1', coCreators: ['u2'], visibleTo: ['u1'] },
    ]);
    expect(rows[0].to).toEqual(['u1', 'u2']);
  });

  it('mirrors only the ties a contact already has — never a Gospel Partner (#1039)', () => {
    const rows = planContactVisibleToBackfill([
      { id: 'c1', createdBy: 'trainee1', coCreators: ['trainee2'] },
    ]);
    expect(rows).toEqual([
      { id: 'c1', from: [], to: ['trainee1', 'trainee2'] },
    ]);
  });

  it('leaves a contact whose partner was never a tie alone', () => {
    const rows = planContactVisibleToBackfill([
      { id: 'c1', createdBy: 'trainee1', visibleTo: ['trainee1'] },
    ]);
    expect(rows).toEqual([]);
  });

  it('drops an access-list entry that no tie accounts for', () => {
    const rows = planContactVisibleToBackfill([
      { id: 'c1', createdBy: 'trainee1', visibleTo: ['trainee1', 'trainee2'] },
    ]);
    expect(rows).toEqual([
      { id: 'c1', from: ['trainee1', 'trainee2'], to: ['trainee1'] },
    ]);
  });
});
