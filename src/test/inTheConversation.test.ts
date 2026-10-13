// In the Conversation (#1604, CONTEXT.md, ADR 0007 amendment): who has written
// in a stream within the last 14 days. The web app and @cisa/core each keep a
// copy (the web app has no @cisa/core dependency), so every case runs against
// both — this corpus is the contract between them.
import { describe, it, expect } from 'vitest';
import { inTheConversation as web } from '../lib/threads';
// Direct relative import into the workspace package -- resolved for tests only.
import { inTheConversation as core } from '../../packages/core/src/threads';

const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.parse('2026-10-01T12:00:00.000Z');
const at = (days: number) => new Date(t0 + days * DAY).toISOString();
const msg = (from: string, days: number, extra: Record<string, unknown> = {}) => ({
  from,
  at: at(days),
  contactId: 'mark',
  interactionId: null,
  scope: null,
  ...extra,
});

describe.each([
  ['web', web],
  ['core', core],
])('inTheConversation (%s)', (_name, inTheConversation) => {
  it('reaches the asker of a Follow-up ask when a teammate replies (#1604)', () => {
    const ask = msg('tony', 0, { kind: 'nudge' });
    const reply = msg('anna', 1, { parentId: 'ask' });
    expect(inTheConversation([ask], reply)).toEqual(['tony']);
  });

  it('never includes the poster', () => {
    const mine = msg('tony', 0);
    expect(inTheConversation([mine, msg('anna', 0.5)], msg('tony', 1))).toEqual(['anna']);
  });

  it('lapses 14 days after your last message there, and writing again renews it', () => {
    const old = msg('tony', 0);
    expect(inTheConversation([old], msg('anna', 14))).toEqual(['tony']);
    expect(inTheConversation([old], msg('anna', 15))).toEqual([]);
    expect(inTheConversation([old, msg('tony', 10)], msg('anna', 15))).toEqual(['tony']);
  });

  it('does not count what you write after the message', () => {
    expect(inTheConversation([msg('tony', 2)], msg('anna', 1))).toEqual([]);
  });

  it('keeps each stream separate', () => {
    const team = msg('tony', 0, { scope: 'team' });
    const onInteraction = msg('beth', 0, { interactionId: 'i1' });
    const otherPerson = msg('carl', 0, { contactId: 'luke' });
    const corpus = [team, onInteraction, otherPerson];
    expect(inTheConversation(corpus, msg('anna', 1))).toEqual([]);
    expect(inTheConversation(corpus, msg('anna', 1, { scope: 'team' }))).toEqual(['tony']);
    expect(inTheConversation(corpus, msg('anna', 1, { interactionId: 'i1' }))).toEqual(['beth']);
  });

  it('names each teammate once', () => {
    expect(inTheConversation([msg('tony', 0), msg('tony', 1)], msg('anna', 2))).toEqual(['tony']);
  });
});
