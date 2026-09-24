import { describe, it, expect } from 'vitest';
import {
  whoWeHaventSeen,
  suggestHomesByCoVisit,
  suggestHomesBySurname,
  type Home,
  type HomeProposal,
} from '../src/homes';
import type { Contact, Visit } from '../src/types';

const NOW = new Date('2026-08-13T12:00:00');

const contact = (id: string, name: string): Contact => ({ id, name } as Contact);

const visit = (id: string, date: string, contactIds: string[]): Visit => ({ id, date, contactIds });

const home = (overrides: Partial<Home> = {}): Home => ({
  id: 'h1',
  label: 'the Oseis',
  members: ['c1'],
  active: true,
  ...overrides,
});

const ids = (list: HomeProposal[]) => list.map((p) => p.memberIds.slice().sort().join('+'));

describe('whoWeHaventSeen', () => {
  it('reads a member never present as a gap even when the home was visited (#1194)', () => {
    const homes = [home({ members: ['c1', 'c2'] })];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    const visits = [visit('v1', '2026-08-10', ['c1'])];

    const [reading] = whoWeHaventSeen(homes, contacts, visits, NOW);
    expect(reading.home.id).toBe('h1');
    expect(reading.everVisited).toBe(true);

    const [ama, bo] = reading.members;
    expect(ama.everSeen).toBe(true);
    expect(ama.lastSeenDate).toBe('2026-08-10');
    expect(ama.daysSinceSeen).toBe(3);
    // Seen this month → the newest bucket (index 11) is marked.
    expect(ama.months[11]).toBe(true);

    expect(bo.everSeen).toBe(false);
    expect(bo.lastSeenDate).toBeNull();
    expect(bo.daysSinceSeen).toBeNull();
    expect(bo.months.every((m) => !m)).toBe(true);
  });

  it('marks exactly the rolling-12-month window a person was seen', () => {
    const homes = [home({ members: ['c1'] })];
    const contacts = [contact('c1', 'Ama Osei')];
    const visits = [
      visit('a', '2025-09-01', ['c1']), // 11 months ago — index 0
      visit('b', '2026-01-15', ['c1']), // index 7
      visit('c', '2026-08-01', ['c1']), // index 11
      visit('d', '2025-07-01', ['c1']), // outside the window (12+ months) — ignored
    ];

    const [reading] = whoWeHaventSeen(homes, contacts, visits, NOW);
    expect(reading.members[0].months).toEqual([
      true, false, false, false, true, false, false, false, false, false, false, true,
    ]);
  });

  it('counts a home with no visits as never visited', () => {
    const homes = [home({ members: ['c1'] })];
    const contacts = [contact('c1', 'Ama Osei')];
    const [reading] = whoWeHaventSeen(homes, contacts, [], NOW);
    expect(reading.everVisited).toBe(false);
    expect(reading.members[0].everSeen).toBe(false);
  });

  it('leaves a person with no home out of the reading entirely', () => {
    const homes = [home({ members: ['c1'] })];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    const visits = [visit('v1', '2026-08-01', ['c2'])];
    const reading = whoWeHaventSeen(homes, contacts, visits, NOW);
    expect(reading).toHaveLength(1);
    expect(reading[0].members.map((m) => m.contactId)).toEqual(['c1']);
  });

  it('hides an inactive home from the reading', () => {
    const homes = [
      home({ id: 'active', members: ['c1'] }),
      home({ id: 'retired', label: 'the Chens', members: ['c2'], active: false }),
    ];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    const reading = whoWeHaventSeen(homes, contacts, [], NOW);
    expect(reading.map((r) => r.home.id)).toEqual(['active']);
  });

  it('orders homes by label ignoring a leading "the", and members by first name', () => {
    const homes = [
      home({ id: 'peinados', label: 'the Peinados', members: ['c2', 'c3'] }),
      home({ id: 'oseis', label: 'Osei', members: ['c1'] }),
      home({ id: 'zhang', label: 'the Zhangs', members: ['c4'] }),
    ];
    const contacts = [
      contact('c1', 'Ama Osei'),
      contact('c2', 'Aaron Peinado'),
      contact('c3', 'Zoe Peinado'),
      contact('c4', 'Wei Zhang'),
    ];
    const reading = whoWeHaventSeen(homes, contacts, [], NOW);
    // "Osei" (no the) < "Peinados" < "Zhangs" — all ignoring the leading "the".
    expect(reading.map((r) => r.home.id)).toEqual(['oseis', 'peinados', 'zhang']);
    // Members by first name.
    expect(reading[1].members.map((m) => m.contactId)).toEqual(['c2', 'c3']);
  });

  it('skips members whose contact record is gone', () => {
    const homes = [home({ members: ['c1', 'missing'] })];
    const contacts = [contact('c1', 'Ama Osei')];
    const [reading] = whoWeHaventSeen(homes, contacts, [], NOW);
    expect(reading.members.map((m) => m.contactId)).toEqual(['c1']);
  });
});

describe('suggestHomesByCoVisit', () => {
  it('proposes one household from the union of people-sets, even with mixed surnames', () => {
    const contacts = [
      contact('c1', 'Ama Osei'),
      contact('c2', 'Bo Chen'),
      contact('c3', 'Cai Liu'),
    ];
    const visits = [
      visit('v1', '2026-08-01', ['c1', 'c2']),
      visit('v2', '2026-07-01', ['c2', 'c3']), // shares c2 → merges into one proposal
    ];
    const out = suggestHomesByCoVisit(visits, contacts);
    expect(ids(out)).toEqual(['c1+c2+c3']);
    expect(out[0].source).toBe('co-visit');
  });

  it('proposes nothing for a person seen only alone', () => {
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    const visits = [visit('v1', '2026-08-01', ['c1'])];
    expect(suggestHomesByCoVisit(visits, contacts)).toEqual([]);
  });

  it('leaves people already in a home out of proposals', () => {
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    const visits = [visit('v1', '2026-08-01', ['c1', 'c2'])];
    expect(suggestHomesByCoVisit(visits, contacts, ['c1'])).toEqual([]);
  });

  it('proposes nothing when a visit names people outside the contacts given', () => {
    const contacts = [contact('c1', 'Ama Osei')];
    const visits = [visit('v1', '2026-08-01', ['c1', 'ghost'])];
    expect(suggestHomesByCoVisit(visits, contacts)).toEqual([]);
  });
});

describe('suggestHomesBySurname', () => {
  it('groups people sharing a surname into one proposal', () => {
    const contacts = [
      contact('c1', 'Ama Osei'),
      contact('c2', 'Kofi Osei'),
      contact('c3', 'Bo Chen'),
    ];
    const out = suggestHomesBySurname(contacts);
    expect(ids(out)).toEqual(['c1+c2']);
    expect(out[0].label).toBe('the Oseis');
    expect(out[0].source).toBe('surname');
  });

  it('leaves a mixed-surname house to the co-visit signal', () => {
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Bo Chen')];
    expect(suggestHomesBySurname(contacts)).toEqual([]);
  });

  it('leaves people already in a home out of proposals', () => {
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Kofi Osei')];
    expect(suggestHomesBySurname(contacts, ['c1'])).toEqual([]);
  });

  it('ignores single-word names that carry no surname', () => {
    const contacts = [contact('c1', 'Ama'), contact('c2', 'Ama')];
    expect(suggestHomesBySurname(contacts)).toEqual([]);
  });
});