import { describe, it, expect } from 'vitest';
import { planContactOwnerBackfill } from '../lib/contactOwnerBackfill';

describe('planContactOwnerBackfill', () => {
  it('plans a write for contacts whose owner is missing', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', createdBy: 'staff-1' },
    ]);
    expect(rows).toEqual([
      { id: 'a', ownerFrom: null, ownerTo: 'staff-1' },
    ]);
  });

  it('falls back to addedBy when createdBy is missing', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', addedBy: 'staff-2' },
    ]);
    expect(rows).toEqual([
      { id: 'a', ownerFrom: null, ownerTo: 'staff-2' },
    ]);
  });

  it('prefers createdBy over addedBy when both are present', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', createdBy: 'staff-1', addedBy: 'staff-2' },
    ]);
    expect(rows).toEqual([
      { id: 'a', ownerFrom: null, ownerTo: 'staff-1' },
    ]);
  });

  it('writes null when there is no creator on record', () => {
    const rows = planContactOwnerBackfill([{ id: 'a' }]);
    expect(rows).toEqual([{ id: 'a', ownerFrom: null, ownerTo: null }]);
  });

  it('skips contacts that already have an owner (idempotency)', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', owner: 'staff-1', createdBy: 'staff-1' },
      { id: 'b', createdBy: 'staff-2' },
      { id: 'c', owner: '', createdBy: 'staff-3' },
    ]);
    expect(rows).toEqual([
      { id: 'b', ownerFrom: null, ownerTo: 'staff-2' },
      { id: 'c', ownerFrom: '', ownerTo: 'staff-3' },
    ]);
  });

  it('treats non-string owner/createdBy/addedBy as missing', () => {
    // Cast through `unknown` to bypass the static type — the planner is
    // defensive against bad data even when the schema shouldn't allow it.
    const rows = planContactOwnerBackfill([
      { id: 'a', owner: 0, createdBy: null, addedBy: undefined } as unknown as Parameters<typeof planContactOwnerBackfill>[0][number],
    ]);
    expect(rows).toEqual([{ id: 'a', ownerFrom: 0, ownerTo: null }]);
  });

  it('returns an empty list when every contact already has an owner', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', owner: 'staff-1' },
      { id: 'b', owner: 'staff-2' },
    ]);
    expect(rows).toEqual([]);
  });
});