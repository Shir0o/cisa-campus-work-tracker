import { describe, it, expect } from 'vitest';
import { peersFromAwareness, type AwarenessUserState } from '../lib/presence';

const states = (...entries: [number, AwarenessUserState][]) => new Map(entries);

const kevin = { uid: 'u-kevin', name: 'Kevin Munga', color: '#b5503f' };
const leonora = { uid: 'u-leonora', name: 'Leonora Banman', color: '#5d8071' };

describe('peersFromAwareness', () => {
  it('collapses several sessions of the same person into one peer', () => {
    const out = peersFromAwareness(
      states([1, { user: kevin }], [2, { user: kevin }], [3, { user: kevin }]),
      99,
      'u-me',
    );
    expect(out).toEqual([{ key: 'u-kevin', name: 'Kevin Munga', color: '#b5503f' }]);
  });

  it('keeps distinct people, in the order they first appear', () => {
    const out = peersFromAwareness(
      states([1, { user: leonora }], [2, { user: kevin }], [3, { user: leonora }]),
      99,
      'u-me',
    );
    expect(out.map((p) => p.name)).toEqual(['Leonora Banman', 'Kevin Munga']);
  });

  it('excludes yourself by clientID and by uid, so your other tabs never show', () => {
    const me = { uid: 'u-me', name: 'Tony Wang', color: '#7d5a86' };
    const out = peersFromAwareness(
      states([99, { user: me }], [100, { user: me }], [1, { user: kevin }]),
      99,
      'u-me',
    );
    expect(out).toEqual([{ key: 'u-kevin', name: 'Kevin Munga', color: '#b5503f' }]);
  });

  it('falls back to the name as the identity when a client sends no uid', () => {
    // Clients on the build that predates uid-in-awareness still collapse sensibly.
    const out = peersFromAwareness(
      states(
        [1, { user: { name: 'Kevin Munga', color: '#b5503f' } }],
        [2, { user: { name: 'Kevin Munga', color: '#b5503f' } }],
      ),
      99,
      'u-me',
    );
    expect(out).toEqual([{ key: 'Kevin Munga', name: 'Kevin Munga', color: '#b5503f' }]);
  });

  it('keys anonymous clients by clientID rather than merging them', () => {
    const out = peersFromAwareness(states([1, {}], [2, { user: {} }]), 99, 'u-me');
    expect(out).toEqual([
      { key: '1', name: 'Someone', color: '#888' },
      { key: '2', name: 'Someone', color: '#888' },
    ]);
  });

  it('returns nothing when only you are here', () => {
    expect(peersFromAwareness(states([99, { user: { uid: 'u-me' } }]), 99, 'u-me')).toEqual([]);
  });
});
