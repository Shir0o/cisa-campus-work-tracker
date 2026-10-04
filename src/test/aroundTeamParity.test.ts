// Mirror parity (#1336, ADR 0033 §6): the Full-timer's **to work through**
// count — the Around the team cards not yet Reviewed — is derived on the web by
// src/lib/attention.ts and on the server (the weekly reminder) by
// packages/core/src/aroundTeam.ts. They must agree for the same contacts,
// interactions, threads and Reviewed stamps, or the reminder announces a number
// the page the reminder opens does not show.
//
// As with reachParity, the two copies exist because this web app deliberately
// has no @cisa/core dependency (see the note at the top of src/lib/goal.ts);
// this corpus is the contract between the mirrors.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  attentionStacksFor,
  buildAttentionItems,
  partitionAttentionStacks,
  toWorkThroughCount,
} from '../lib/attention';
import { pruned } from '../lib/inboxState';
import { __resetUserEntityStateCache } from '../lib/userEntityState';
import {
  aroundTeamStackIds as coreStackIds,
  aroundTeamToWorkThrough as coreToWorkThrough,
  reviewedStackIds as coreReviewed,
  type AroundTeamInput,
} from '../../packages/core/src/aroundTeam';
import type { Contact, Interaction } from '../types';
import type { ThreadMessageWithContact } from '../lib/threads';

const ME = 'ft1';
const T = (h: number) => new Date(Date.UTC(2026, 5, 1, h)).toISOString();

const CONTACTS = [
  { id: 'own', createdBy: ME, createdAt: T(1) },
  { id: 'tr', createdBy: 'tr1', createdAt: T(2) },
  { id: 'tr-b', createdBy: 'tr2', createdAt: T(3) },
  { id: 'signup', createdAt: T(4) },
  { id: 'adder', createdBy: 'tr1', addedBy: ME, createdAt: T(5) },
  { id: 'co', createdBy: 'tr1', coCreators: [ME] },
  { id: 'founded', createdBy: 'tr1', founders: [ME] },
  { id: 'carried', createdBy: 'tr2', carers: [ME] },
  { id: 'kept', createdBy: 'tr2', createdAt: T(6) },
  { id: 'mentioned', createdBy: 'tr1', createdAt: T(7) },
  { id: 'asked', createdBy: 'tr1', createdAt: T(8) },
  { id: 'asked-answered', createdBy: 'tr1', createdAt: T(9) },
  { id: 'their-q', createdBy: 'tr2', createdAt: T(10) },
  { id: 'team-mention', createdBy: 'tr2', createdAt: T(11) },
];

const INTERACTIONS = [
  { id: 'i1', contactId: 'tr', userId: 'tr1', createdAt: T(12) },
  { id: 'i2', contactId: 'orphan', userId: 'tr1', createdAt: T(12) },
  { id: 'i3', contactId: 'orphan-mine', userId: ME, createdAt: T(12) },
  { id: 'i4', contactId: 'orphan-legacy', createdById: 'tr2', createdAt: T(12) },
  { id: 'i5', contactId: 'orphan-nobody', createdAt: T(12) },
];

const THREADS = [
  { id: 'm1', contactId: 'mentioned', from: 'tr1', kind: 'comment', at: T(13), mentionedUserIds: [ME] },
  { id: 'm2', contactId: 'asked', from: ME, kind: 'question', at: T(13) },
  { id: 'm3', contactId: 'asked-answered', from: ME, kind: 'question', at: T(13) },
  { id: 'm4', contactId: 'asked-answered', from: 'tr1', kind: 'comment', at: T(14) },
  { id: 'm5', contactId: 'their-q', from: 'tr2', kind: 'question', at: T(13) },
  { id: 'm6', contactId: 'team-mention', from: 'ft2', kind: 'note', at: T(13), scope: 'team' as const, mentionedUserIds: [ME] },
  { id: 'm7', contactId: 'orphan-thread', from: 'tr1', kind: 'question', at: T(13) },
  { id: 'm8', contactId: 'orphan-encourage', from: 'tr1', kind: 'encouragement', at: T(13), mentionedUserIds: [ME] },
  { id: 'm9', contactId: 'orphan-note', from: 'tr1', kind: 'note', at: T(13) },
  { id: 'm10', contactId: 'orphan-mention', from: 'tr1', kind: 'note', at: T(13), mentionedUserIds: [ME] },
  { id: 'm11', contactId: 'co', from: 'tr1', kind: 'nudge', at: T(13) },
  { id: 'm12', contactId: '', from: 'tr1', kind: 'question', at: T(13) },
  { id: 'm13', contactId: 'tr-b', from: 'tr2', kind: 'encouragement', at: T(13), mentionedUserIds: [ME] },
];

const PERSONAL = new Set(['kept', 'orphan']);

function webAroundTeam(input: AroundTeamInput) {
  const contacts = input.contacts as Contact[];
  const personal = input.personalContactIds ? new Set(input.personalContactIds) : null;
  const items = buildAttentionItems({
    role: 'admin',
    uid: input.uid,
    contacts,
    interactions: input.interactions as Interaction[],
    threads: input.threads.map((m) => ({ ...m, body: '' })) as unknown as ThreadMessageWithContact[],
    personalContactIds: personal,
  });
  return partitionAttentionStacks(
    attentionStacksFor(items, input.uid),
    contacts,
    input.uid,
    'admin',
    personal,
  ).aroundTeam;
}

const CASES: Array<[string, AroundTeamInput]> = [
  ['empty', { uid: ME, contacts: [], interactions: [], threads: [] }],
  ['contacts only', { uid: ME, contacts: CONTACTS, interactions: [], threads: [] }],
  ['the whole corpus', { uid: ME, contacts: CONTACTS, interactions: INTERACTIONS, threads: THREADS }],
  [
    'the whole corpus, with a kept set',
    { uid: ME, contacts: CONTACTS, interactions: INTERACTIONS, threads: THREADS, personalContactIds: PERSONAL },
  ],
  ['another reader', { uid: 'tr1', contacts: CONTACTS, interactions: INTERACTIONS, threads: THREADS }],
];

describe('Around the team to-work-through mirror parity (web vs core)', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
  });

  it.each(CASES)('the same cards land on Around the team: %s', (_name, input) => {
    expect(coreStackIds(input).sort()).toEqual(webAroundTeam(input).map((s) => s.id).sort());
  });

  it.each(CASES)('the same number is left to work through: %s', (_name, input) => {
    const stacks = webAroundTeam(input);
    const reviewed = new Set(stacks.filter((_, i) => i % 3 === 0).map((s) => s.id));
    reviewed.add('att:contact:not-a-card');
    expect(coreToWorkThrough(input, reviewed)).toBe(toWorkThroughCount(stacks, (s) => reviewed.has(s.id)));
  });

  it('reads the same Reviewed stamps, pruned after a term', () => {
    const at = Date.parse('2026-10-01T00:00:00.000Z');
    const stamps = {
      fresh: '2026-09-30T00:00:00.000Z',
      edge: new Date(at - 120 * 86_400_000).toISOString(),
      stale: '2026-01-01T00:00:00.000Z',
      bad: 'nope',
    };
    expect([...coreReviewed(stamps, at)].sort()).toEqual(Object.keys(pruned(stamps, at)).sort());
  });
});
