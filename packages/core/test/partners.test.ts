import { describe, it, expect } from 'vitest';
import {
  partnersTermKey,
  cleanPartnerGroups,
  groupsForTerm,
  groupOf,
  partnerUidsOf,
  applyPartners,
  partnersOf,
  stampPartners,
  addToGroup,
  removeFromGroups,
  dropGroup,
  carryOverPartners,
  clearTerm,
} from '../src/data/partners';

const TERM = () => partnersTermKey(new Date(2026, 8, 1)); // Sep 2026 → "Fall 2026"

describe('term keys', () => {
  it('labels a date with its season and year', () => {
    expect(partnersTermKey(new Date(2026, 2, 15))).toBe('Spring 2026');
    expect(partnersTermKey(new Date(2026, 8, 1))).toBe('Fall 2026');
  });
});

describe('cleanPartnerGroups', () => {
  it('drops groups with fewer than two people and de-dupes', () => {
    expect(cleanPartnerGroups([['a', 'b'], ['solo'], ['x', 'x', 'y'], null as any, ['', 'b']])).toEqual([
      ['a', 'b'],
      ['x', 'y'],
    ]);
  });
});

describe('groupOf / partnerUidsOf', () => {
  const groups = [
    ['a', 'b'],
    ['c', 'd', 'e'],
  ];
  it('finds the group a uid sits in', () => {
    expect(groupOf(groups, 'a')).toEqual(['a', 'b']);
    expect(groupOf(groups, 'nobody')).toBeNull();
  });
  it('returns everyone else in the group', () => {
    expect(partnerUidsOf(groups, 'a')).toEqual(['b']);
    expect(partnerUidsOf(groups, 'd')).toEqual(['c', 'e']);
    expect(partnerUidsOf(groups, 'nobody')).toEqual([]);
  });
});

describe('applyPartners / partnersOf / stampPartners', () => {
  it('applyPartners reads only the current term and partnersOf answers it', () => {
    applyPartners(
      { 'Fall 2026': [['a', 'b']], 'Spring 2026': [['z', 'w']] },
      new Date(2026, 8, 1),
    );
    expect(partnersOf('a')).toEqual(['b']);
    expect(partnersOf('b')).toEqual(['a']);
    expect(partnersOf('z')).toEqual([]);
    expect(partnersOf(undefined)).toEqual([]);
  });

  it('stampPartners names the adder’s partner as a co-creator', () => {
    applyPartners({ 'Fall 2026': [['a', 'b']] }, new Date(2026, 8, 1));
    const contact = stampPartners<{ name: string; coCreators?: string[] }>({ name: 'Mira' }, 'a');
    expect(contact.coCreators).toEqual(['b']);
    // idempotent when the data already carries the partner
    const again = stampPartners<{ name: string; coCreators?: string[] }>({ name: 'Mira', coCreators: ['b', 'c'] }, 'a');
    expect(again.coCreators).toEqual(['b', 'c']);
  });

  it('stampPartners is a no-op without a partner or a uid', () => {
    applyPartners({ 'Fall 2026': [['a', 'b']] }, new Date(2026, 8, 1));
    expect(stampPartners({ name: 'Mira' }, 'solo')).toEqual({ name: 'Mira' });
    expect(stampPartners({ name: 'Mira' }, null)).toEqual({ name: 'Mira' });
  });
});

describe('arrangement mutations', () => {
  const term = TERM();

  it('addToGroup joins an anchor (leaving any previous group)', () => {
    const base = addToGroup(null, term, 'a', 'b');
    expect(groupsForTerm(base, term)).toEqual([['b', 'a']]);
    // a leftover single person is not a partnership — it's dropped
    const moved = addToGroup(base, term, 'a', 'c');
    expect(groupsForTerm(moved, term)).toEqual([['c', 'a']]);
  });

  it('a person works in one partnership — addToGroup detaches them first', () => {
    const base = addToGroup(null, term, 'a', 'b');
    const next = addToGroup(base, term, 'c', 'a');
    expect(groupsForTerm(next, term)).toEqual([['b', 'a', 'c']]);
  });

  it('removeFromGroups takes a uid out of every group', () => {
    const base = addToGroup(null, term, 'a', 'b');
    // leaving the pair's other person alone is not a partnership — gone
    const next = removeFromGroups(base, term, 'a');
    expect(groupsForTerm(next, term)).toEqual([]);
  });

  it('dropGroup dissolves a whole group by index', () => {
    const base = addToGroup(addToGroup(null, term, 'a', 'b'), term, 'c', 'd');
    expect(groupsForTerm(base, term)).toHaveLength(2);
    const next = dropGroup(base, term, 0);
    expect(groupsForTerm(next, term)).toEqual([['d', 'c']]);
  });

  it('carryOverPartners brings a previous term’s arrangement over', () => {
    const last = addToGroup(null, 'Spring 2026', 'a', 'b');
    const now = carryOverPartners(last, 'Spring 2026', term);
    expect(groupsForTerm(now, term)).toEqual([['b', 'a']]);
  });

  it('clearTerm empties the current term without touching history', () => {
    const base = {
      'Fall 2026': [['a', 'b']],
      'Spring 2026': [['c', 'd']],
    };
    const next = clearTerm(base, term);
    expect(groupsForTerm(next, term)).toEqual([]);
    expect(groupsForTerm(next, 'Spring 2026')).toEqual([['c', 'd']]);
  });
});