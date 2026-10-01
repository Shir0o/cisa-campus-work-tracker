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
  isTiedTo as webTied,
  reachByContact as webReach,
  tiedTeammateNames as webTiedNames,
  unreachedContacts as webUnreached,
  unreachedTagCounts as webTagCounts,
} from '../lib/reach';
import {
  isReached as coreReached,
  isTiedTo as coreTied,
  reachByContact as coreReach,
  tiedTeammateNames as coreTiedNames,
  unreachedContacts as coreUnreached,
  unreachedTagCounts as coreTagCounts,
} from '../../packages/core/src/reach';
import type {
  ReachPerson as WebReachPerson,
  ReachSources as WebSources,
  TagCountPerson as WebTagCountPerson,
} from '../lib/reach';
import type {
  ReachPerson as CoreReachPerson,
  ReachSources as CoreSources,
  TagCountPerson as CoreTagCountPerson,
} from '../../packages/core/src/reach';

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

  it('agrees on ties, tied teammate names, and the Not-reached-yet scopes (#1287)', () => {
    const webSource: WebSources = { interactions: INTERACTIONS, gatherings: GATHERINGS };
    const coreSource: CoreSources = { interactions: INTERACTIONS, gatherings: GATHERINGS };
    const webMap = webReach(webSource);
    const coreMap = coreReach(coreSource);
    const people: WebReachPerson[] = [
      { id: 'c1', kind: 'contact', createdAtMs: PARITY_NOW - DAY, createdBy: 'u1' },
      { id: 'c2', kind: 'contact', createdAtMs: PARITY_NOW - 2 * DAY, founders: ['u1', 'u2'] },
      { id: 'c5', kind: 'contact', createdAtMs: PARITY_NOW - 3 * DAY, carers: ['u2'] },
      { id: 'c9', kind: 'our-own', createdAtMs: PARITY_NOW - DAY, createdBy: 'u1' },
    ];
    const names = { u1: 'Ana', u2: 'Bo' };

    for (const person of people) {
      expect(webTied(person, 'u1'), person.id).toBe(coreTied(person, 'u1'));
      expect(webTiedNames(person, names), person.id).toEqual(coreTiedNames(person, names));
    }

    for (const scope of ['yours', 'team'] as const) {
      const web = webUnreached(people, webMap, { scope, viewerUid: 'u1', nowMs: PARITY_NOW });
      const core = coreUnreached(
        people as unknown as CoreReachPerson[],
        coreMap,
        { scope, viewerUid: 'u1', nowMs: PARITY_NOW },
      );
      expect(web.map((p) => p.id), scope).toEqual(core.map((p) => p.id));
    }
  });
});
