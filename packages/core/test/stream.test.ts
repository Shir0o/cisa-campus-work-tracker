import { describe, it, expect } from 'vitest';
import { buildStream, buildThread, type StreamMessage, type StreamItem, type StreamRow } from '../src/stream';

// Local-time fixtures: day boundaries in the stream are the viewer's own days,
// so every date here is built in local time and the suite holds in any zone.
const at = (d: number, h: number, m = 0, s = 0) => new Date(2026, 8, d, h, m, s).toISOString();
const NOW = new Date(2026, 8, 24, 12, 0).getTime(); // Thu Sep 24 2026, noon

let seq = 0;
function msg(p: Partial<StreamMessage>): StreamMessage {
  seq += 1;
  return {
    id: p.id ?? `m${seq}`,
    parentId: null,
    from: 'maria',
    fromName: 'Maria Santos',
    kind: 'comment',
    body: 'hello',
    at: at(24, 9),
    ...p,
  };
}

const MARIA = { uid: 'maria', role: 'manager' as const };
const rows = (items: StreamItem[]) => items.filter((i): i is StreamRow => i.type === 'row');
const shape = (items: StreamItem[]) =>
  items.map((i) =>
    i.type === 'day' ? `day:${i.relative}:${i.day}` : i.type === 'new' ? 'new' : `${i.message.id}${i.continuation ? '+' : ''}`,
  );

describe('buildStream — order and grouping (G2, G4)', () => {
  it('orders oldest first whatever order the source hands them in', () => {
    const items = buildStream({
      messages: [msg({ id: 'b', at: at(24, 10) }), msg({ id: 'a', at: at(24, 9), from: 'josh' })],
      viewer: MARIA,
      now: NOW,
    });
    expect(rows(items).map((r) => r.message.id)).toEqual(['a', 'b']);
  });

  it.each([
    ['same author, 4 minutes on', 'maria', at(24, 9, 4), true],
    ['same author, exactly 5 minutes on', 'maria', at(24, 9, 5), true],
    ['same author, 5 minutes and a second on', 'maria', at(24, 9, 5, 1), false],
    ['another author, 1 minute on', 'josh', at(24, 9, 1), false],
  ])('%s → continuation %s', (_label, from, second, continues) => {
    const items = buildStream({
      messages: [msg({ id: 'first', at: at(24, 9) }), msg({ id: 'second', from, at: second })],
      viewer: MARIA,
      now: NOW,
    });
    expect(rows(items).map((r) => r.continuation)).toEqual([false, continues]);
  });

  it('measures the 5 minutes from the author’s last message, so a burst keeps grouping', () => {
    const items = buildStream({
      messages: [
        msg({ id: 'a', at: at(24, 9, 0) }),
        msg({ id: 'b', at: at(24, 9, 4) }),
        msg({ id: 'c', at: at(24, 9, 8) }),
      ],
      viewer: MARIA,
      now: NOW,
    });
    expect(rows(items).map((r) => r.continuation)).toEqual([false, true, true]);
  });

  it('never continues across a day boundary, even a minute apart', () => {
    const items = buildStream({
      messages: [msg({ id: 'late', at: at(22, 23, 59) }), msg({ id: 'early', at: at(23, 0, 0) })],
      viewer: MARIA,
      now: NOW,
    });
    expect(shape(items)).toEqual([
      `day:earlier:2026-09-22`,
      'late',
      `day:yesterday:2026-09-23`,
      'early',
    ]);
  });

  it('a Question or a Follow-up ask always shows its author, so its tag has a name to sit beside', () => {
    const items = buildStream({
      messages: [
        msg({ id: 'a', at: at(24, 9, 0) }),
        msg({ id: 'q', at: at(24, 9, 1), kind: 'question' }),
        msg({ id: 'ask', at: at(24, 9, 2), kind: 'nudge' }),
      ],
      viewer: MARIA,
      now: NOW,
    });
    expect(rows(items).map((r) => r.continuation)).toEqual([false, false, false]);
  });

  it('leaves replies out of the stream; they are reached through their parent', () => {
    const items = buildStream({
      messages: [msg({ id: 'p' }), msg({ id: 'r', parentId: 'p', at: at(24, 9, 1) })],
      viewer: MARIA,
      now: NOW,
    });
    expect(rows(items).map((r) => r.message.id)).toEqual(['p']);
  });
});

describe('buildStream — day dividers relative to now (G5)', () => {
  it.each([
    ['earlier today', at(24, 0, 5), 'today'],
    ['late yesterday', at(23, 23, 50), 'yesterday'],
    ['the day before', at(22, 12, 0), 'earlier'],
    ['this date a year ago', new Date(2025, 8, 24, 11, 0).toISOString(), 'earlier'],
  ])('%s → %s', (_label, when, relative) => {
    const [divider] = buildStream({ messages: [msg({ at: when })], viewer: MARIA, now: NOW });
    expect(divider).toMatchObject({ type: 'day', relative });
  });

  it('one divider per day, above that day’s first message', () => {
    const items = buildStream({
      messages: [
        msg({ id: 'a', at: at(22, 10), from: 'maria' }),
        msg({ id: 'b', at: at(22, 11), from: 'josh' }),
        msg({ id: 'c', at: at(24, 9), from: 'grace' }),
      ],
      viewer: MARIA,
      now: NOW,
    });
    expect(shape(items)).toEqual(['day:earlier:2026-09-22', 'a', 'b', 'day:today:2026-09-24', 'c']);
  });

  it('an empty stream has nothing to draw', () => {
    expect(buildStream({ messages: [], viewer: MARIA, now: NOW })).toEqual([]);
  });
});

describe('buildStream — the New line (G6)', () => {
  const three = () => [
    msg({ id: 'a', at: at(24, 9, 0), from: 'josh', fromName: 'Josh Park' }),
    msg({ id: 'b', at: at(24, 9, 2), from: 'josh', fromName: 'Josh Park' }),
    msg({ id: 'c', at: at(24, 9, 4), from: 'josh', fromName: 'Josh Park' }),
  ];

  it.each([
    ['no read state', undefined, ['day:today:2026-09-24', 'a', 'b+', 'c+']],
    ['read up to the middle', at(24, 9, 2), ['day:today:2026-09-24', 'a', 'b+', 'new', 'c']],
    ['read nothing yet', at(20, 0), ['day:today:2026-09-24', 'new', 'a', 'b+', 'c+']],
    ['read everything', at(24, 11), ['day:today:2026-09-24', 'a', 'b+', 'c+']],
  ])('%s', (_label, lastReadAt, expected) => {
    const items = buildStream({ messages: three(), viewer: MARIA, now: NOW, lastReadAt });
    expect(shape(items)).toEqual(expected);
  });

  it('your own message is never unread', () => {
    const items = buildStream({
      messages: [msg({ id: 'mine', at: at(24, 9), from: 'maria' }), msg({ id: 'theirs', at: at(24, 10), from: 'josh' })],
      viewer: MARIA,
      now: NOW,
      lastReadAt: at(24, 8),
    });
    expect(shape(items)).toEqual(['day:today:2026-09-24', 'mine', 'new', 'theirs']);
  });

  it('sits below the day divider when the first unread opens a new day', () => {
    const items = buildStream({
      messages: [msg({ id: 'old', at: at(23, 9), from: 'josh' }), msg({ id: 'fresh', at: at(24, 9), from: 'josh' })],
      viewer: MARIA,
      now: NOW,
      lastReadAt: at(23, 9),
    });
    expect(shape(items)).toEqual(['day:yesterday:2026-09-23', 'old', 'day:today:2026-09-24', 'new', 'fresh']);
  });
});

describe('buildStream — Thread summaries (T1)', () => {
  const reply = (id: string, from: string, fromName: string, minute: number) =>
    msg({ id, parentId: 'p', from, fromName, at: at(24, 10, minute) });

  it.each([
    ['no replies', [], null],
    [
      'duplicate repliers are counted once among the faces, every reply in the count',
      [reply('r1', 'josh', 'Josh Park', 1), reply('r2', 'grace', 'Grace Liu', 2), reply('r3', 'josh', 'Josh Park', 3)],
      {
        count: 3,
        lastReplyAt: at(24, 10, 3),
        repliers: [
          { uid: 'josh', name: 'Josh Park' },
          { uid: 'grace', name: 'Grace Liu' },
        ],
      },
    ],
    [
      'more than three repliers shows the first three to reply',
      [
        reply('r1', 'josh', 'Josh Park', 1),
        reply('r2', 'grace', 'Grace Liu', 2),
        reply('r3', 'ruth', 'Ruth Chen', 3),
        reply('r4', 'kai', 'Kai Moana', 4),
      ],
      {
        count: 4,
        lastReplyAt: at(24, 10, 4),
        repliers: [
          { uid: 'josh', name: 'Josh Park' },
          { uid: 'grace', name: 'Grace Liu' },
          { uid: 'ruth', name: 'Ruth Chen' },
        ],
      },
    ],
  ])('%s', (_label, replies, expected) => {
    const items = buildStream({
      messages: [msg({ id: 'p', at: at(24, 10) }), ...[...(replies as StreamMessage[])].reverse()],
      viewer: MARIA,
      now: NOW,
    });
    expect(rows(items)[0].thread).toEqual(expected);
  });
});

describe('buildStream — kinds and Follow-up ask state (K1–K3)', () => {
  it.each([
    ['comment', null],
    ['note', null],
    ['question', 'question'],
    ['nudge', 'ask'],
    [undefined, null],
  ])('a %s carries tag %s', (kind, tag) => {
    const [, row] = buildStream({ messages: [msg({ kind })], viewer: MARIA, now: NOW });
    expect((row as StreamRow).tag).toBe(tag);
  });

  it.each([
    ['open since yesterday afternoon', {}, { status: 'open', daysOpen: 1 }],
    ['open since this morning', { at: at(24, 8) }, { status: 'open', daysOpen: 0 }],
    ['open for a week', { at: at(17, 8) }, { status: 'open', daysOpen: 7 }],
    [
      'followed up by someone else',
      { closedBy: 'josh', closedByName: 'Josh Park', closedAt: at(24, 11) },
      { status: 'followedUp', by: { uid: 'josh', name: 'Josh Park' }, at: at(24, 11) },
    ],
    [
      'withdrawn by the asker',
      { closedBy: 'maria', closedByName: 'Maria Santos', closedAt: at(24, 11) },
      { status: 'withdrawn', by: { uid: 'maria', name: 'Maria Santos' }, at: at(24, 11) },
    ],
  ])('an ask %s', (_label, over, expected) => {
    const [, row] = buildStream({
      messages: [msg({ kind: 'nudge', from: 'maria', at: at(23, 16, 40), ...over })],
      viewer: MARIA,
      now: NOW,
    });
    expect((row as StreamRow).ask).toEqual(expected);
  });

  it('a message that is not an ask has no ask state', () => {
    const [, row] = buildStream({ messages: [msg({ kind: 'question' })], viewer: MARIA, now: NOW });
    expect((row as StreamRow).ask).toBeNull();
    expect((row as StreamRow).askActions).toEqual([]);
  });

  const ask = (over: Partial<StreamMessage> = {}) =>
    msg({ id: 'ask', kind: 'nudge', from: 'maria', fromName: 'Maria Santos', at: at(23, 16), ...over });
  const closed = { closedBy: 'josh', closedByName: 'Josh Park', closedAt: at(24, 9) };

  it.each([
    ['the asker (a Trainee), open', { uid: 'maria', role: 'manager' }, {}, ['followedUp', 'neverMind']],
    ['a Trainee who is not the asker, open', { uid: 'josh', role: 'manager' }, {}, ['followedUp']],
    ['a Full-timer who is not the asker, open', { uid: 'ruth', role: 'admin' }, {}, ['followedUp']],
    ['the asker as a Full-timer, open', { uid: 'maria', role: 'admin' }, {}, ['followedUp', 'neverMind']],
    ['a read-only viewer, open', { uid: 'vic', role: 'viewer' }, {}, []],
    ['the asker, once followed up', { uid: 'maria', role: 'manager' }, closed, []],
    ['a Full-timer, once followed up', { uid: 'ruth', role: 'admin' }, closed, []],
  ])('%s → %j', (_label, viewer, over, actions) => {
    const [, row] = buildStream({ messages: [ask(over)], viewer, now: NOW });
    expect((row as StreamRow).askActions).toEqual(actions);
  });
});

describe('buildStream — who may delete (G7, T1)', () => {
  it.each([
    ['the author', { uid: 'maria', role: 'manager' }, false, true],
    ['someone else, a Trainee', { uid: 'josh', role: 'manager' }, false, false],
    ['a Full-timer', { uid: 'ruth', role: 'admin' }, false, true],
    ['the author, while replies remain', { uid: 'maria', role: 'manager' }, true, false],
    ['a Full-timer, while replies remain', { uid: 'ruth', role: 'admin' }, true, false],
  ])('%s → %s', (_label, viewer, withReply, deletable) => {
    const messages = [msg({ id: 'p', from: 'maria' })];
    if (withReply) messages.push(msg({ id: 'r', parentId: 'p', from: 'josh', at: at(24, 9, 30) }));
    const [, row] = buildStream({ messages, viewer, now: NOW });
    expect((row as StreamRow).canDelete).toBe(deletable);
  });
});

describe('buildThread — one message and its replies (T1, T2)', () => {
  const messages = () => [
    msg({ id: 'other', at: at(22, 9), from: 'grace' }),
    msg({ id: 'p', at: at(22, 11, 2), from: 'josh', fromName: 'Josh Park' }),
    msg({ id: 'r2', parentId: 'p', at: at(22, 11, 23), from: 'maria' }),
    msg({ id: 'r1', parentId: 'p', at: at(22, 11, 20), from: 'maria' }),
    msg({ id: 'r3', parentId: 'p', at: at(23, 8), from: 'grace', fromName: 'Grace Liu' }),
    msg({ id: 'elsewhere', parentId: 'other', at: at(22, 12), from: 'maria' }),
  ];

  it('holds the parent, then its replies oldest first, grouped like the stream', () => {
    const thread = buildThread({ messages: messages(), viewer: MARIA, now: NOW }, 'p');
    expect(thread?.parent.message.id).toBe('p');
    expect(thread?.parent.thread?.count).toBe(3);
    expect(thread?.replies.map((r) => `${r.message.id}${r.continuation ? '+' : ''}`)).toEqual(['r1', 'r2+', 'r3']);
  });

  it('a parent whose replies remain cannot be deleted; each reply can be, by its author', () => {
    const thread = buildThread({ messages: messages(), viewer: MARIA, now: NOW }, 'p');
    expect(thread?.parent.canDelete).toBe(false);
    expect(thread?.replies.map((r) => r.canDelete)).toEqual([true, true, false]);
  });

  it('is null once the parent is gone', () => {
    expect(buildThread({ messages: messages(), viewer: MARIA, now: NOW }, 'missing')).toBeNull();
  });
});
