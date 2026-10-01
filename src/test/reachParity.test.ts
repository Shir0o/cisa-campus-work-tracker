// Mirror parity (#1293, ADR 0033 §6): the web app's reach model (src/lib/reach.ts)
// and the shared core's (packages/core/src/reach.ts) must give the same answer
// for the same interactions and Gatherings, or the same person is reached on one
// app and not on the other.
//
// As with contactKindParity, the two copies exist because this web app
// deliberately has no @cisa/core dependency (see the note at the top of
// src/lib/goal.ts); this corpus is the contract between the mirrors.
import { describe, it, expect } from 'vitest';
import {
  isReached as webReached,
  reachByContact as webReach,
  unreachedTagCounts as webTagCounts,
} from '../lib/reach';
import {
  isReached as coreReached,
  reachByContact as coreReach,
  unreachedTagCounts as coreTagCounts,
} from '../../packages/core/src/reach';
import type { ReachSources as WebSources, TagCountPerson as WebTagCountPerson } from '../lib/reach';
import type { ReachSources as CoreSources, TagCountPerson as CoreTagCountPerson } from '../../packages/core/src/reach';

const INTERACTIONS = [
  { contactId: 'c1', ms: 1_700_000_000_000 },
  { contactId: 'c2', ms: 1_700_100_000_000 },
  { contactId: 'c3', ms: Number.NaN },
  { contactId: '', ms: 5 },
];
const GATHERINGS = [
  { date: '2026-09-20', attendance: { present: ['c1', 'c4'], absent: ['c2'] } },
  { date: '2026-09-27', attendance: { present: ['c2'], absent: [] } },
  { date: '2026-10-04' },
];
const CONTACTS = ['c1', 'c2', 'c3', 'c4', 'c5', 'unreached'];

const PARITY_NOW = new Date('2026-10-01T12:00:00Z').getTime();
const DAY = 86_400_000;
const PEOPLE_STATIC = [
  { id: 'c1', kind: 'contact', createdAtMs: PARITY_NOW - DAY, tags: ['BFA', 'Freshman'] },
  { id: 'c2', kind: 'contact', createdAtMs: PARITY_NOW - 40 * DAY, tags: ['BFA'] },
  { id: 'c4', kind: 'local-saint', createdAtMs: PARITY_NOW - DAY, tags: ['BFA'] },
  { id: 'c5', kind: 'our-own', createdAtMs: PARITY_NOW - DAY, tags: ['Freshman'] },
  { id: 'c3', kind: 'contact', createdAtMs: null, tags: ['BFA'] },
] as const;

describe('reach mirror parity (web vs core)', () => {
  it('agrees on every person', () => {
    const web: WebSources = { interactions: INTERACTIONS, gatherings: GATHERINGS };
    const core: CoreSources = { interactions: INTERACTIONS, gatherings: GATHERINGS };
    const webMap = webReach(web);
    const coreMap = coreReach(core);

    expect([...webMap.keys()].sort()).toEqual([...coreMap.keys()].sort());
    for (const id of CONTACTS) {
      expect(webMap.get(id) ?? null, id).toEqual(coreMap.get(id) ?? null);
      expect(webReached(id, web), id).toBe(coreReached(id, core));
    }
  });

  it('agrees on every tag count (#1300)', () => {
    const webSource: WebSources = { interactions: INTERACTIONS, gatherings: GATHERINGS };
    const coreSource: CoreSources = { interactions: INTERACTIONS, gatherings: GATHERINGS };
    const people = [
      ...PEOPLE_STATIC,
      { id: 'c1', kind: 'contact', createdAtMs: PARITY_NOW - DAY, tags: ['new'] },
    ];
    const webCounts = webTagCounts(
      people as unknown as WebTagCountPerson[],
      webReach(webSource),
      PARITY_NOW,
    );
    const coreCounts = coreTagCounts(
      people as unknown as CoreTagCountPerson[],
      coreReach(coreSource),
      PARITY_NOW,
    );
    expect([...webCounts.entries()].sort()).toEqual([...coreCounts.entries()].sort());
  });
});
