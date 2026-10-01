import { describe, it, expect } from 'vitest';
import {
  isReached,
  isTiedTo,
  reachByContact,
  tiedTeammateNames,
  unreachedContacts,
  unreachedTagCounts,
  UNREACHED_TAG_WINDOW_DAYS,
  type ReachPerson,
  type ReachSources,
  type TagCountPerson,
} from '../src/reach';
import type { ContactKind } from '../src/directory';

const interaction = (contactId: string, ms: number) => ({ contactId, ms });
const gathering = (date: string, present: string[]) => ({ date, attendance: { present, absent: [] } });

const empty: ReachSources = { interactions: [], gatherings: [] };

const NOW = new Date('2026-10-01T12:00:00Z').getTime();
const DAY = 86_400_000;
const person = (
  id: string,
  createdAtMs: number,
  tags: string[],
  kind: ContactKind = 'contact',
): TagCountPerson => ({ id, kind, createdAtMs, tags });

describe('reach model (#1293)', () => {
  it('a Text or Call tap alone does not count', () => {
    // Tapping Call or Text writes nothing, so the rule sees no interaction
    // and no attendance.
    expect(isReached('c1', empty)).toBe(false);
  });

  it('is reached by an interaction', () => {
    expect(isReached('c1', { interactions: [interaction('c1', 1_700_000_000_000)], gatherings: [] })).toBe(true);
  });

  it('is reached by attendance', () => {
    expect(
      isReached('c1', { interactions: [], gatherings: [gathering('2026-09-20', ['c1'])] }),
    ).toBe(true);
  });

  it('is not reached by a gathering they were absent from or unmarked at', () => {
    const sources: ReachSources = {
      interactions: [],
      gatherings: [
        { date: '2026-09-20', attendance: { present: ['c2'], absent: ['c1'] } },
        { date: '2026-09-27' },
      ],
    };
    expect(isReached('c1', sources)).toBe(false);
  });

  it('does not count an interaction logged with someone else', () => {
    expect(isReached('c1', { interactions: [interaction('c2', 1)], gatherings: [] })).toBe(false);
  });

  it('reads the newest reach across interactions and attendance', () => {
    const map = reachByContact({
      interactions: [interaction('c1', 1_000)],
      gatherings: [gathering('2026-09-20', ['c1'])],
    });
    const read = map.get('c1')!;
    expect(read.reached).toBe(true);
    expect(read.ms).toBe(new Date('2026-09-20').getTime());
  });

  it('keys each person separately', () => {
    const map = reachByContact({
      interactions: [interaction('c1', 1_000)],
      gatherings: [gathering('2026-09-20', ['c2'])],
    });
    expect([...map.keys()].sort()).toEqual(['c1', 'c2']);
    expect(map.get('c1')?.ms).toBe(1_000);
    expect(map.get('c2')?.ms).toBe(new Date('2026-09-20').getTime());
  });
});

describe('unreached tag counts (#1300)', () => {
  const reached = (id: string) => reachByContact({ interactions: [interaction(id, NOW)], gatherings: [] });

  it('counts only the people nobody has reached', () => {
    const people = [person('a', NOW - DAY, ['BFA']), person('b', NOW - DAY, ['BFA'])];
    const reach = reached('b');
    expect(unreachedTagCounts(people, reach, NOW).get('BFA')).toBe(1);
  });

  it('counts every tag a person carries', () => {
    const people = [person('a', NOW - DAY, ['BFA', 'Freshman'])];
    const counts = unreachedTagCounts(people, new Map(), NOW);
    expect(counts.get('BFA')).toBe(1);
    expect(counts.get('Freshman')).toBe(1);
  });

  it('covers only the Contact kind — Local saints and Our own never count', () => {
    const people = [
      person('a', NOW - DAY, ['BFA'], 'contact'),
      person('b', NOW - DAY, ['BFA'], 'local-saint'),
      person('c', NOW - DAY, ['BFA'], 'our-own'),
    ];
    expect(unreachedTagCounts(people, new Map(), NOW).get('BFA')).toBe(1);
  });

  it('covers only people added in the last 30 days', () => {
    const people = [
      person('recent', NOW - (UNREACHED_TAG_WINDOW_DAYS - 1) * DAY, ['BFA']),
      person('edge', NOW - UNREACHED_TAG_WINDOW_DAYS * DAY, ['BFA']),
      person('old', NOW - UNREACHED_TAG_WINDOW_DAYS * DAY - 1, ['BFA']),
    ];
    expect(unreachedTagCounts(people, new Map(), NOW).get('BFA')).toBe(2);
  });

  it('leaves a tag out entirely when it has no one unreached', () => {
    const people = [person('a', NOW - DAY, ['BFA'])];
    expect(unreachedTagCounts(people, reached('a'), NOW).has('BFA')).toBe(false);
  });

  it('treats a missing or unreadable createdAt as outside the window', () => {
    const people = [
      { id: 'a', kind: 'contact', createdAtMs: null, tags: ['BFA'] } as TagCountPerson,
      person('b', NOW - DAY, ['BFA']),
    ];
    expect(unreachedTagCounts(people, new Map(), NOW).get('BFA')).toBe(1);
  });
});

// The My Day card (#1287): people added in the last 30 days nobody has reached,
// narrowed to the reader's ties ("yours") or the whole team, and the names of
// the teammates tied to each.
describe('not reached yet card (#1287)', () => {
  const reachPerson = (
    id: string,
    createdAtMs: number | null,
    ties: Partial<ReachPerson> = {},
    kind: ContactKind = 'contact',
  ): ReachPerson => ({ id, kind, createdAtMs, ...ties });

  const reached = (id: string) =>
    reachByContact({ interactions: [interaction(id, NOW)], gatherings: [] });
  const opts = (scope: 'yours' | 'team', viewerUid: string) => ({ scope, viewerUid, nowMs: NOW });

  describe('isTiedTo', () => {
    it('counts each of the four ties that make a teammate a recipient', () => {
      expect(isTiedTo({ createdBy: 'u1' }, 'u1')).toBe(true);
      expect(isTiedTo({ addedBy: 'u1' }, 'u1')).toBe(true);
      expect(isTiedTo({ founders: ['u1'] }, 'u1')).toBe(true);
      expect(isTiedTo({ coCreators: ['u1'] }, 'u1')).toBe(true);
      expect(isTiedTo({ carers: ['u1'] }, 'u1')).toBe(true);
    });

    it('is false for a teammate with no tie, and for a blank viewer', () => {
      expect(isTiedTo({ createdBy: 'u2', founders: ['u3'] }, 'u1')).toBe(false);
      expect(isTiedTo({ createdBy: 'u1' }, '')).toBe(false);
      expect(isTiedTo(null, 'u1')).toBe(false);
    });
  });

  describe('tiedTeammateNames', () => {
    const names = { u1: 'Ana', u2: 'Bo', u3: 'Cy' };

    it('names every tied teammate, de-duplicated across ties', () => {
      expect(
        tiedTeammateNames(
          { createdBy: 'u1', founders: ['u1', 'u2'], coCreators: ['u3'], carers: ['u2'] },
          names,
        ),
      ).toEqual(['Ana', 'Bo', 'Cy']);
    });

    it('drops a tie whose uid has no name', () => {
      expect(tiedTeammateNames({ createdBy: 'ghost', founders: ['u2'] }, names)).toEqual(['Bo']);
    });
  });

  describe('unreachedContacts', () => {
    it('keeps only Contacts nobody has reached, added in the window', () => {
      const people = [
        reachPerson('fresh', NOW - DAY),
        reachPerson('reached', NOW - DAY),
        reachPerson('old', NOW - 31 * DAY),
        reachPerson('saint', NOW - DAY, {}, 'local-saint'),
      ];
      const listed = unreachedContacts(people, reached('reached'), opts('team', 'u1'));
      expect(listed.map((p) => p.id)).toEqual(['fresh']);
    });

    it('lists newest added first', () => {
      const people = [
        reachPerson('older', NOW - 20 * DAY),
        reachPerson('newer', NOW - 2 * DAY),
      ];
      const listed = unreachedContacts(people, new Map(), opts('team', 'u1'));
      expect(listed.map((p) => p.id)).toEqual(['newer', 'older']);
    });

    it('“yours” keeps only the people the reader is tied to', () => {
      const people = [
        reachPerson('mine', NOW - DAY, { createdBy: 'u1' }),
        reachPerson('theirs', NOW - DAY, { createdBy: 'u2' }),
      ];
      const listed = unreachedContacts(people, new Map(), opts('yours', 'u1'));
      expect(listed.map((p) => p.id)).toEqual(['mine']);
    });

    it('“team” keeps everyone, whatever the tie', () => {
      const people = [
        reachPerson('mine', NOW - DAY, { createdBy: 'u1' }),
        reachPerson('theirs', NOW - DAY, { createdBy: 'u2' }),
      ];
      const listed = unreachedContacts(people, new Map(), opts('team', 'u1'));
      expect(listed.map((p) => p.id)).toEqual(['mine', 'theirs']);
    });
  });
});
