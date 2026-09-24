// Mirror parity (ADR 0031): the web app's home reading (src/lib/homes.ts) and
// the shared core's (packages/core/src/homes.ts) must give the same answer for
// the same homes, people and visits, or a Full-timer's phone and the web page
// could disagree about who has been missed.
//
// As with contactKindParity, the two copies exist because this web app
// deliberately has no @cisa/core dependency (see the note at the top of
// src/lib/goal.ts); this corpus is the contract between the mirrors.
import { describe, it, expect } from 'vitest';
import {
  whoWeHaventSeen as webReading,
  suggestHomesByCoVisit as webCoVisit,
  suggestHomesBySurname as webSurname,
  type HomeReading as WebReading,
} from '../lib/homes';
import {
  whoWeHaventSeen as coreReading,
  suggestHomesByCoVisit as coreCoVisit,
  suggestHomesBySurname as coreSurname,
  type Home as CoreHome,
} from '../../packages/core/src/homes';
import type { Home as WebHome, Contact as WebContact, Visit as WebVisit } from '../types';
import type { Contact as CoreContact, Visit as CoreVisit } from '../../packages/core/src/types';

const NOW = new Date('2026-08-13T12:00:00');

const webHome = (h: { id: string; label: string; members: string[]; active?: boolean }): WebHome => ({
  id: h.id,
  label: h.label,
  members: h.members,
  active: h.active ?? true,
});
const coreHome = (h: { id: string; label: string; members: string[]; active?: boolean }): CoreHome => ({
  id: h.id,
  label: h.label,
  members: h.members,
  active: h.active ?? true,
});

const webContact = (c: { id: string; name: string }): WebContact => ({ id: c.id, name: c.name } as WebContact);
const coreContact = (c: { id: string; name: string }): CoreContact => ({ id: c.id, name: c.name } as CoreContact);

const webVisit = (v: { id: string; date: string; contactIds: string[] }): WebVisit =>
  ({ id: v.id, date: v.date, contactIds: v.contactIds } as WebVisit);
const coreVisit = (v: { id: string; date: string; contactIds: string[] }): CoreVisit =>
  ({ id: v.id, date: v.date, contactIds: v.contactIds } as CoreVisit);

const HOMES = [
  { id: 'h1', label: 'the Oseis', members: ['c1', 'c2'], active: true },
  { id: 'h2', label: 'Peinado', members: ['c3'], active: true },
  { id: 'h3', label: 'the retired Zhangs', members: ['c4'], active: false },
];
const CONTACTS = [
  { id: 'c1', name: 'Ama Osei' },
  { id: 'c2', name: 'Bo Chen' },
  { id: 'c3', name: 'Aaron Peinado' },
  { id: 'c4', name: 'Wei Zhang' },
  { id: 'c5', name: 'Nobody' },
];
const VISITS = [
  { id: 'v1', date: '2026-08-10', contactIds: ['c1'] },
  { id: 'v2', date: '2026-03-02', contactIds: ['c1', 'c2'] },
  { id: 'v3', date: '2025-09-01', contactIds: ['c3'] },
  { id: 'v4', date: '2025-01-01', contactIds: ['c3'] },
];

const normalize = (r: WebReading) => ({
  home: r.home.id,
  everVisited: r.everVisited,
  members: r.members.map((m) => ({
    contactId: m.contactId,
    name: m.name,
    months: m.months,
    daysSinceSeen: m.daysSinceSeen,
    lastSeenDate: m.lastSeenDate,
    everSeen: m.everSeen,
  })),
});

describe('whoWeHaventSeen mirror parity (web vs core)', () => {
  it('derives the same home reading for the same inputs', () => {
    const web = webReading(
      HOMES.map(webHome),
      CONTACTS.map(webContact),
      VISITS.map(webVisit),
      NOW,
    );
    const core = coreReading(
      HOMES.map(coreHome),
      CONTACTS.map(coreContact),
      VISITS.map(coreVisit),
      NOW,
    );
    expect(web.map(normalize)).toEqual(core.map(normalize));
    expect(web.length).toBe(2); // the inactive home drops out
    expect(web[0].home.id).toBe('h1'); // "the Oseis" sorts as "oseis" < "peinado"
  });

  it('proposes the same co-visit households', () => {
    const visits = [...VISITS, { id: 'v5', date: '2026-07-01', contactIds: ['c4', 'c5'] }];
    const excluded = ['c1'];
    expect(webCoVisit(visits.map(webVisit), CONTACTS.map(webContact), excluded)).toEqual(
      coreCoVisit(visits.map(coreVisit), CONTACTS.map(coreContact), excluded),
    );
  });

  it('proposes the same surname households', () => {
    const excluded = ['c1'];
    expect(webSurname(CONTACTS.map(webContact), excluded)).toEqual(
      coreSurname(CONTACTS.map(coreContact), excluded),
    );
  });
});