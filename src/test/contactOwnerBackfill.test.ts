import { describe, it, expect } from 'vitest';
import { planContactOwnerBackfill } from '../lib/contactOwnerBackfill';

describe('planContactOwnerBackfill', () => {
  it('plans a write for contacts whose owner is missing', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', createdBy: 'staff-1' },
    ]);
    expect(rows).toEqual([
      { id: 'a', ownerFrom: null, ownerTo: 'staff-1', visibleToTo: ['staff-1'] },
    ]);
  });

  it('falls back to addedBy when createdBy is missing', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', addedBy: 'staff-2' },
    ]);
    expect(rows).toEqual([
      { id: 'a', ownerFrom: null, ownerTo: 'staff-2', visibleToTo: ['staff-2'] },
    ]);
  });

  it('prefers createdBy over addedBy when both are present', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', createdBy: 'staff-1', addedBy: 'staff-2' },
    ]);
    // `owner` resolves to one of them, but both are persisted ties, so both
    // belong in the access list.
    expect(rows).toEqual([
      { id: 'a', ownerFrom: null, ownerTo: 'staff-1', visibleToTo: ['staff-1', 'staff-2'] },
    ]);
  });

  it('writes null when there is no creator on record', () => {
    const rows = planContactOwnerBackfill([{ id: 'a' }]);
    expect(rows).toEqual([{ id: 'a', ownerFrom: null, ownerTo: null, visibleToTo: [] }]);
  });

  it('skips contacts that already have an owner (idempotency)', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', owner: 'staff-1', createdBy: 'staff-1' },
      { id: 'b', createdBy: 'staff-2' },
      { id: 'c', owner: '', createdBy: 'staff-3' },
    ]);
    expect(rows).toEqual([
      { id: 'b', ownerFrom: null, ownerTo: 'staff-2', visibleToTo: ['staff-2'] },
      { id: 'c', ownerFrom: '', ownerTo: 'staff-3', visibleToTo: ['staff-3'] },
    ]);
  });

  it('treats non-string owner/createdBy/addedBy as missing', () => {
    // Cast through `unknown` to bypass the static type — the planner is
    // defensive against bad data even when the schema shouldn't allow it.
    const rows = planContactOwnerBackfill([
      { id: 'a', owner: 0, createdBy: null, addedBy: undefined } as unknown as Parameters<typeof planContactOwnerBackfill>[0][number],
    ]);
    expect(rows).toEqual([{ id: 'a', ownerFrom: 0, ownerTo: null, visibleToTo: [] }]);
  });

  // #1024 phase 4: stamping `owner` is stamping a tie, so the same row must
  // carry the derived access list. Without it this backfill hands a contact an
  // owner who then cannot see it -- exactly the shape the visibleTo backfill
  // keeps finding in prod.
  describe('visibleTo (#1024 phase 4)', () => {
    it('derives the access list from the ties it is about to leave behind', () => {
      const rows = planContactOwnerBackfill([
        { id: 'a', createdBy: 'staff-1' },
      ]);
      expect(rows[0].visibleToTo).toEqual(['staff-1']);
    });

    it('keeps existing coCreators and addedBy in the derived list', () => {
      const rows = planContactOwnerBackfill([
        { id: 'a', addedBy: 'staff-2', coCreators: ['staff-3'] },
      ]);
      // owner resolves to addedBy; the list is every tie, de-duplicated.
      expect(rows[0].ownerTo).toBe('staff-2');
      expect(rows[0].visibleToTo).toEqual(['staff-2', 'staff-3']);
    });

    it('leaves an untied contact with an empty list rather than a phantom id', () => {
      const rows = planContactOwnerBackfill([{ id: 'a' }]);
      expect(rows[0].ownerTo).toBeNull();
      expect(rows[0].visibleToTo).toEqual([]);
    });
  });

  it('returns an empty list when every contact already has an owner', () => {
    const rows = planContactOwnerBackfill([
      { id: 'a', owner: 'staff-1' },
      { id: 'b', owner: 'staff-2' },
    ]);
    expect(rows).toEqual([]);
  });
});