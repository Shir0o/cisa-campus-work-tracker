import { describe, it, expect } from 'vitest';
import { planContactOwnerRetirement } from '../lib/contactOwnerRetirement';

describe('planContactOwnerRetirement', () => {
  it('drops the retired caregiver field and recomputes the access list', () => {
    const rows = planContactOwnerRetirement([
      { id: 'c1', createdBy: 'u1', owner: 'u2', visibleTo: ['u1', 'u2'] },
    ]);
    expect(rows).toEqual([
      {
        id: 'c1',
        ownerDropped: 'u2',
        fieldPresent: true,
        visibleToFrom: ['u1', 'u2'],
        visibleToTo: ['u1'],
        losesAccess: ['u2'],
        gainsAccess: [],
      },
    ]);
  });

  it('keeps an ex-caregiver who is held by another tie', () => {
    const rows = planContactOwnerRetirement([
      { id: 'c1', createdBy: 'u1', owner: 'u2', founders: ['u1', 'u2'], visibleTo: ['u1', 'u2'] },
    ]);
    expect(rows[0].losesAccess).toEqual([]);
    expect(rows[0].visibleToTo).toEqual(['u1', 'u2']);
  });

  it('keeps an ex-caregiver who took the person into their sheep', () => {
    const rows = planContactOwnerRetirement([
      { id: 'c1', createdBy: 'u1', owner: 'u2', carers: ['u2'], visibleTo: ['u1', 'u2'] },
    ]);
    expect(rows[0].losesAccess).toEqual([]);
  });

  it('is idempotent: a retired contact with a correct list is skipped', () => {
    const rows = planContactOwnerRetirement([
      { id: 'c1', createdBy: 'u1', visibleTo: ['u1'] },
    ]);
    expect(rows).toEqual([]);
  });

  it('plans a write for a contact that still carries the field even when empty', () => {
    const rows = planContactOwnerRetirement([
      { id: 'c1', createdBy: 'u1', owner: null, visibleTo: ['u1'] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerDropped).toBeNull();
    expect(rows[0].fieldPresent).toBe(true);
    expect(rows[0].losesAccess).toEqual([]);
  });

  it('repairs an access list that a tie-writer never recomputed', () => {
    const rows = planContactOwnerRetirement([
      { id: 'c1', createdBy: 'u1', coCreators: ['u3'], visibleTo: ['u1'] },
    ]);
    expect(rows[0].gainsAccess).toEqual(['u3']);
    expect(rows[0].visibleToTo).toEqual(['u1', 'u3']);
  });

  it('leaves a deliberately tie-less contact alone', () => {
    const rows = planContactOwnerRetirement([{ id: 'c1', visibleTo: [] }]);
    expect(rows).toEqual([]);
  });

  it('ignores list ordering in the stored access list', () => {
    const rows = planContactOwnerRetirement([
      { id: 'c1', createdBy: 'u1', coCreators: ['u3'], visibleTo: ['u3', 'u1'] },
    ]);
    expect(rows).toEqual([]);
  });
});
