import { describe, it, expect } from 'vitest';
import { planLegacyRoleDowngrade } from '../lib/legacyRoleDowngrade';

describe('planLegacyRoleDowngrade', () => {
  it('moves a Student or Community account to an unapproved Trainee', () => {
    const plan = planLegacyRoleDowngrade([
      { id: 's1', role: 'operator', approved: true },
      { id: 'c1', role: 'viewer', approved: true },
    ]);
    expect(plan).toEqual([
      { id: 's1', from: 'operator', set: { role: 'manager', approved: false } },
      { id: 'c1', from: 'viewer', set: { role: 'manager', approved: false } },
    ]);
  });

  it('leaves Full-timers and Trainees alone, approved or not', () => {
    expect(
      planLegacyRoleDowngrade([
        { id: 'a', role: 'admin', approved: true },
        { id: 'm', role: 'manager', approved: true },
        { id: 'p', role: 'manager', approved: false },
      ]),
    ).toEqual([]);
  });

  it('downgrades an already-unapproved legacy account too, so no legacy role survives', () => {
    expect(planLegacyRoleDowngrade([{ id: 'x', role: 'viewer', approved: false }])).toEqual([
      { id: 'x', from: 'viewer', set: { role: 'manager', approved: false } },
    ]);
  });

  it('is idempotent: a second pass over the result finds nothing', () => {
    const users = [{ id: 's1', role: 'operator', approved: true }];
    const after = planLegacyRoleDowngrade(users).map((row) => ({ id: row.id, ...row.set }));
    expect(planLegacyRoleDowngrade(after)).toEqual([]);
  });
});
