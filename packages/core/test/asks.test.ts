import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  askQuestions,
  askQuestionsBy,
  askRepliesOf,
  askAnswered,
  askWaitedDays,
  askWaitedWords,
  askStacksFor,
  type AskMessage,
} from '../src/asks';

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

function msg(p: Partial<AskMessage>): AskMessage {
  return {
    id: 'q',
    parentId: null,
    owner: p.from ?? 't1',
    from: 't1',
    fromName: 'Zion',
    kind: 'question',
    body: '?',
    at: daysAgo(1),
    reactions: [],
    ...p,
  };
}

// Lock time so askWaitedDays/Words are deterministic.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('askQuestions', () => {
  it('returns top-level questions only, newest first', () => {
    const qs = askQuestions([
      msg({ id: 'old', at: daysAgo(3) }),
      msg({ id: 'new', at: hoursAgo(2) }),
      msg({ id: 'ans', parentId: 'old', kind: 'comment', at: hoursAgo(1) }),
    ]);
    expect(qs.map((q) => q.id)).toEqual(['new', 'old']);
  });
});

describe('askQuestionsBy', () => {
  it('returns only the given user\'s own questions', () => {
    const qs = askQuestionsBy(
      [
        msg({ id: 'mine', from: 't1', at: hoursAgo(2) }),
        msg({ id: 'theirs', from: 't2', at: hoursAgo(1) }),
      ],
      't1',
    );
    expect(qs.map((q) => q.id)).toEqual(['mine']);
  });
});

describe('askRepliesOf', () => {
  it('returns the answers under a question, oldest first', () => {
    const replies = askRepliesOf(
      [
        msg({ id: 'a1', parentId: 'q', kind: 'comment', from: 'ft1', at: hoursAgo(3) }),
        msg({ id: 'a2', parentId: 'q', kind: 'comment', from: 'ft2', at: hoursAgo(1) }),
        msg({ id: 'other', parentId: 'z', kind: 'comment', at: hoursAgo(2) }),
      ],
      'q',
    );
    expect(replies.map((r) => r.id)).toEqual(['a1', 'a2']);
  });
});

describe('askAnswered', () => {
  it('true when anyone other than the asker replied', () => {
    const m = msg({ id: 'q', from: 't1' });
    expect(
      askAnswered([m, msg({ id: 'a', parentId: 'q', kind: 'comment', from: 'ft1' })], m),
    ).toBe(true);
  });

  it('false when only the asker replied (self-answer does not clear it)', () => {
    const m = msg({ id: 'q', from: 't1' });
    expect(
      askAnswered([m, msg({ id: 'a', parentId: 'q', kind: 'comment', from: 't1' })], m),
    ).toBe(false);
  });
});

describe('askWaitedDays / askWaitedWords', () => {
  it('says today for a fresh question', () => {
    const m = msg({ at: hoursAgo(1) });
    expect(askWaitedDays(m)).toBe(0);
    expect(askWaitedWords(m)).toBe('asked today');
  });

  it('says yesterday after one day', () => {
    expect(askWaitedWords(msg({ at: daysAgo(1) }))).toBe('waiting since yesterday');
  });

  it('counts whole days after that', () => {
    expect(askWaitedWords(msg({ at: daysAgo(4) }))).toBe('waiting 4 days');
  });
});

describe('askStacksFor', () => {
  it('returns nothing for a non-full-timer', () => {
    // The helper is deliberately uid-agnostic about role (the caller decides
    // whether to render), but it must never include the viewer's own questions.
    expect(askStacksFor([msg({ id: 'mine', from: 'ft1' })], 'ft1')).toEqual([]);
  });

  it('stacks unanswered questions per asker, newest-first, excluding answered and own', () => {
    const m1 = msg({ id: 'q1', from: 't1', at: hoursAgo(4) });
    const m2 = msg({ id: 'q2', from: 't1', at: hoursAgo(2) });
    const m3 = msg({ id: 'q3', from: 't2', at: hoursAgo(3) });
    const answered = msg({ id: 'q4', from: 't3', at: hoursAgo(1) });
    const reply = msg({ id: 'a4', parentId: 'q4', kind: 'comment', from: 'ft1', at: hoursAgo(0.5) });
    const own = msg({ id: 'q5', from: 'ft1', at: hoursAgo(0.2) });

    const stacks = askStacksFor([m1, m2, m3, answered, reply, own], 'ft1');
    // t1 has the newest open question → its stack comes first.
    expect(stacks.map((s) => s.from)).toEqual(['t1', 't2']);
    expect(stacks[0].items.map((i) => i.id)).toEqual(['q2', 'q1']);
    expect(stacks[0].id).toBe('ask:t1');
  });
});