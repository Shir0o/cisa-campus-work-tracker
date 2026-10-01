// Mirror parity (#1293, ADR 0033 §6): the web app's reach model (src/lib/reach.ts)
// and the shared core's (packages/core/src/reach.ts) must give the same answer
// for the same interactions and Gatherings, or the same person is reached on one
// app and not on the other.
//
// As with contactKindParity, the two copies exist because this web app
// deliberately has no @cisa/core dependency (see the note at the top of
// src/lib/goal.ts); this corpus is the contract between the mirrors.
import { describe, it, expect } from 'vitest';
import { isReached as webReached, reachByContact as webReach } from '../lib/reach';
import { isReached as coreReached, reachByContact as coreReach } from '../../packages/core/src/reach';
import type { ReachSources as WebSources } from '../lib/reach';
import type { ReachSources as CoreSources } from '../../packages/core/src/reach';

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
});
