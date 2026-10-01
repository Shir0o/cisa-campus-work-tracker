import { describe, it, expect } from 'vitest';
import { isReached, reachByContact, type ReachSources } from '../src/reach';

const interaction = (contactId: string, ms: number) => ({ contactId, ms });
const gathering = (date: string, present: string[]) => ({ date, attendance: { present, absent: [] } });

const empty: ReachSources = { interactions: [], gatherings: [] };

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
