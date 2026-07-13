import { describe, it, expect } from 'vitest';
import { inboxItemsFor, traineeWaitingItems } from '../src/inbox';
import type { Contact, Interaction } from '../src/types';
import type { ThreadMessageWithContact } from '../src/threads';

const FT = 'b5YPihN2cGRESPRgiTd8sMlNGBz2';
const TRAINEE = 'JfcxyTTTFuNUYMLQTisyq2ppoy82';

const contacts = [
  { id: 'c1', createdBy: TRAINEE, createdAt: '2026-07-01T10:00:00Z', reviewed: false },
  { id: 'c2', createdBy: FT, createdAt: '2026-07-02T10:00:00Z' }, // FT's own → excluded
] as unknown as Contact[];

const interactions = [
  { id: 'i1', userId: TRAINEE, contactId: 'c1', content: 'Met for coffee', dateTime: '2026-07-03T10:00:00Z', createdAt: '2026-07-03T10:00:00Z' },
  { id: 'i2', userId: FT, contactId: 'c1', content: 'FT own log', dateTime: '2026-07-03T11:00:00Z', createdAt: '2026-07-03T11:00:00Z' },
] as unknown as Interaction[];

function msg(p: Partial<ThreadMessageWithContact>): ThreadMessageWithContact {
  return {
    id: 'm', interactionId: null, from: TRAINEE, fromName: 'Zion',
    kind: 'question', body: '?', at: '2026-07-04T10:00:00Z', reactions: [],
    contactId: 'c1', ...p,
  };
}

describe('inboxItemsFor (full-timer feed)', () => {
  it('returns nothing for a non-full-timer', () => {
    expect(inboxItemsFor(TRAINEE, { contacts, interactions, threads: [] })).toEqual([]);
  });

  it('surfaces team contacts + interactions + unanswered questions, excluding the FT own', () => {
    const items = inboxItemsFor(FT, {
      contacts,
      interactions,
      threads: [msg({ id: 'q1' })],
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain('contact:c1');
    expect(ids).not.toContain('contact:c2'); // FT's own
    expect(ids).toContain('interaction:i1');
    expect(ids).not.toContain('interaction:i2'); // FT's own
    expect(ids).toContain('thread:q1');
    // newest-first
    const times = items.map((i) => new Date(i.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('excludes a question the full-timer already answered later', () => {
    const items = inboxItemsFor(FT, {
      contacts: [],
      interactions: [],
      threads: [
        msg({ id: 'q1', from: TRAINEE, kind: 'question', at: '2026-07-04T10:00:00Z' }),
        msg({ id: 'a1', from: FT, kind: 'comment', at: '2026-07-04T12:00:00Z' }),
      ],
    });
    expect(items.map((i) => i.id)).not.toContain('thread:q1');
  });
});

describe('traineeWaitingItems', () => {
  it('surfaces unanswered nudges/questions from the walking full-timer', () => {
    const items = traineeWaitingItems(TRAINEE, [
      msg({ id: 'n1', from: FT, kind: 'nudge', at: '2026-07-05T10:00:00Z' }),
      msg({ id: 'q2', from: FT, kind: 'question', at: '2026-07-05T11:00:00Z' }),
      msg({ id: 'other', from: FT, kind: 'comment', at: '2026-07-05T12:00:00Z' }), // not nudge/question
    ]);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('thread:n1');
    expect(ids).toContain('thread:q2');
    expect(ids).not.toContain('thread:other');
  });

  it('drops a nudge the trainee has since replied to', () => {
    const items = traineeWaitingItems(TRAINEE, [
      msg({ id: 'n1', from: FT, kind: 'nudge', at: '2026-07-05T10:00:00Z' }),
      msg({ id: 'r1', from: TRAINEE, kind: 'comment', at: '2026-07-05T13:00:00Z' }),
    ]);
    expect(items.map((i) => i.id)).not.toContain('thread:n1');
  });
});
