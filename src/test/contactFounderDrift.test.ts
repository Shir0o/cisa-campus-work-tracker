import { describe, it, expect } from 'vitest';
import {
  planContactFounderDrift,
  impliedFounders,
  pairingsFromSettings,
  type PartnerPairing,
} from '../lib/contactFounderDrift';

const P = (id: string, members: string[], startDate: string, endDate?: string): PartnerPairing => ({
  id,
  members,
  startDate,
  ...(endDate ? { endDate } : {}),
});

describe('impliedFounders (#1049 oracle)', () => {
  it('is the creator plus everyone in the live pairing on the creation day', () => {
    const pairings = [P('1', ['a', 'b'], '2026-08-01')];
    expect(impliedFounders(pairings, 'a', '2026-09-01')).toEqual(['a', 'b']);
  });

  it('is exactly the creator when no pairing covered the creation day', () => {
    const pairings = [P('1', ['a', 'b'], '2026-08-01', '2026-08-31')];
    expect(impliedFounders(pairings, 'a', '2026-09-01')).toEqual(['a']);
  });
});

describe('planContactFounderDrift', () => {
  it('reports a contact whose stored founders disagree with the pairing history at creation', () => {
    const rows = planContactFounderDrift(
      [{ id: 'c1', createdBy: 'a', founders: ['a'], createdAt: '2026-09-01T12:00:00.000Z' }],
      [P('1', ['a', 'b'], '2026-08-01')],
    );
    expect(rows).toEqual([
      {
        contactId: 'c1',
        anchor: 'a',
        createdAt: '2026-09-01',
        stored: ['a'],
        implied: ['a', 'b'],
        outcome: 'drift',
        reason: 'founders-disagree',
      },
    ]);
  });

  it('reports when the history implies MORE founders than stored (backdated pairing)', () => {
    // The pairing began long before it was recorded; a Full-timer backdates it,
    // so the history now implies the partner was live when the contact was made.
    const rows = planContactFounderDrift(
      [{ id: 'c1', createdBy: 'a', founders: ['a'], createdAt: '2026-09-01T12:00:00.000Z' }],
      [P('1', ['a', 'b'], '2026-08-01', '2026-08-15'), P('2', ['a', 'b'], '2026-08-20')],
    );
    expect(rows[0].implied).toEqual(['a', 'b']);
    expect(rows[0].outcome).toBe('drift');
  });

  it('does not imply a partner whose pairing had ended by creation time', () => {
    const rows = planContactFounderDrift(
      [{ id: 'c1', createdBy: 'a', founders: ['a', 'b'], createdAt: '2026-09-10T12:00:00.000Z' }],
      [P('1', ['a', 'b'], '2026-08-01', '2026-08-31')],
    );
    expect(rows).toEqual([
      {
        contactId: 'c1',
        anchor: 'a',
        createdAt: '2026-09-10',
        stored: ['a', 'b'],
        implied: ['a'],
        outcome: 'drift',
        reason: 'founders-disagree',
      },
    ]);
  });

  it('skips a contact whose stored founders match the pairing history', () => {
    const rows = planContactFounderDrift(
      [{ id: 'c1', createdBy: 'a', founders: ['a', 'b'], createdAt: '2026-09-01T12:00:00.000Z' }],
      [P('1', ['a', 'b'], '2026-08-01')],
    );
    expect(rows).toEqual([]);
  });

  it('skips contacts that carry no founders field (contacts predating #1049)', () => {
    const rows = planContactFounderDrift(
      [
        { id: 'old', createdBy: 'a', createdAt: '2026-09-01T12:00:00.000Z' },
      ],
      [P('1', ['a', 'b'], '2026-08-01')],
    );
    expect(rows).toEqual([]);
  });

  it('marks a contact it cannot verify as unverifiable rather than guessing', () => {
    const rows = planContactFounderDrift(
      [
        { id: 'c1', founders: ['a'], createdAt: '2026-09-01T12:00:00.000Z' },
        { id: 'c2', createdBy: 'a', founders: ['a'] },
      ],
      [P('1', ['a', 'b'], '2026-08-01')],
    );
    expect(rows.map((r) => r.outcome)).toEqual(['unverifiable', 'unverifiable']);
  });

  it('produces only a read — never a write', () => {
    const rows = planContactFounderDrift(
      [{ id: 'c1', createdBy: 'a', founders: ['a'], createdAt: '2026-09-01T12:00:00.000Z' }],
      [P('1', ['a', 'b'], '2026-08-01')],
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual([
      'anchor',
      'contactId',
      'createdAt',
      'implied',
      'outcome',
      'reason',
      'stored',
    ]);
  });
});

describe('pairingsFromSettings', () => {
  it('reads the dated records when present', () => {
    const pairings = pairingsFromSettings({
      pairings: [{ id: '1', members: ['a', 'b'], startDate: '2026-09-01' }],
    });
    expect(pairings).toEqual([{ id: '1', members: ['a', 'b'], startDate: '2026-09-01' }]);
  });

  it('migrates a legacy byTerm map into dated records', () => {
    const now = new Date(2026, 8, 1);
    const pairings = pairingsFromSettings(
      { byTerm: { 'Fall 2026': [{ members: ['a', 'b'] }] } },
      now,
    );
    expect(pairings[0].members).toEqual(['a', 'b']);
    // The current term stays open-ended from its first day.
    expect(pairings[0].startDate).toBe('2026-08-01');
    expect(pairings[0].endDate).toBeUndefined();
  });

  it('returns an empty list for an empty or missing document', () => {
    expect(pairingsFromSettings(null)).toEqual([]);
    expect(pairingsFromSettings(undefined)).toEqual([]);
    expect(pairingsFromSettings({})).toEqual([]);
  });
});