import { describe, it, expect } from 'vitest';
import { contactVisibilityConstraints } from '../lib/contactQueries';

describe('contactVisibilityConstraints', () => {
  it('constrains a Trainee to their own visibleTo entries', () => {
    const constraints = contactVisibilityConstraints('manager', 'u1');
    expect(constraints).toHaveLength(1);
    // `where` returns an opaque constraint; its serialized shape carries the
    // field/op/value we rely on.
    const c = constraints[0] as unknown as {
      _op: string;
      _field: { canonicalString: () => string };
    };
    expect(c._op).toBe('array-contains');
    expect(c._field.canonicalString()).toBe('visibleTo');
  });

  it('leaves readers who see the whole roster unconstrained', () => {
    expect(contactVisibilityConstraints('admin', 'u1')).toEqual([]);
    expect(contactVisibilityConstraints('operator', 'u1')).toEqual([]);
    expect(contactVisibilityConstraints('viewer', 'u1')).toEqual([]);
  });

  it('does not constrain when there is no staff id to scope by', () => {
    expect(contactVisibilityConstraints('manager', null)).toEqual([]);
  });
});
