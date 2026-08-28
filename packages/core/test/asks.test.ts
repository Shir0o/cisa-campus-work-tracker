import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
  askQuestions,
  askQuestionsBy,
  askRepliesOf,
  askAnswered,
  askWaitedDays,
  askWaitedWords,
  askStacksFor,
  askTakenBy,
  askOrigin,
  askVisibleFor,
  askUnreadFor,
  type AskMessage,
  type AskOriginResult,
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

describe('askTakenBy', () => {
  it('returns null if takenBy is not set', () => {
    expect(askTakenBy(msg({ id: 'q1' }))).toBeNull();
  });

  it('returns uid and name when takenBy is present', () => {
    const m = msg({ id: 'q2', takenBy: 'ft1', takenByName: 'Mei Lin' });
    expect(askTakenBy(m)).toEqual({ uid: 'ft1', name: 'Mei Lin' });
  });

  it('falls back to uid if takenByName is missing', () => {
    const m = msg({ id: 'q3', takenBy: 'ft2' });
    expect(askTakenBy(m)).toEqual({ uid: 'ft2', name: 'ft2' });
  });
});

describe('askVisibleFor', () => {
  const m1 = msg({ id: 'q1', from: 't1', at: hoursAgo(3) });
  const m2 = msg({ id: 'q2', from: 't2', at: hoursAgo(2) });
  const m3 = msg({ id: 'q3', from: 't1', at: hoursAgo(1) });
  const all = [m1, m2, m3];

  it('returns all top-level questions for full-timers, newest first', () => {
    const res = askVisibleFor(all, 'ft1', true);
    expect(res.map((x) => x.id)).toEqual(['q3', 'q2', 'q1']);
  });

  it('returns only own questions for trainees, newest first', () => {
    const res = askVisibleFor(all, 't1', false);
    expect(res.map((x) => x.id)).toEqual(['q3', 'q1']);
  });
});

describe('askUnreadFor', () => {
  const q1 = msg({ id: 'q1', from: 't1' });
  const q2 = msg({ id: 'q2', from: 't2' });
  const r1 = msg({ id: 'r1', parentId: 'q1', from: 'ft1', kind: 'comment' });
  const all = [q1, q2, r1];

  it('counts unanswered questions from others that are unread for full-timers', () => {
    const read = new Set(['ask:q1']);
    const isRead = (key: string) => read.has(key);
    // q1 is answered by ft1, q2 is unanswered and unread -> 1 unread
    expect(askUnreadFor(all, 'ft1', true, isRead)).toBe(1);
  });

  it('counts unread replies from others for trainees', () => {
    const isRead = (key: string) => key === 'ask:other';
    // t1 owns q1, r1 is a reply from ft1 on q1 and not in read set -> 1 unread
    expect(askUnreadFor(all, 't1', false, isRead)).toBe(1);
    // if read set contains r1 -> 0 unread
    expect(askUnreadFor(all, 't1', false, (k) => k === 'ask:r1')).toBe(0);
  });
});

describe('askOrigin', () => {
  it('handles direct questions viewed by someone else', () => {
    const m = msg({ id: 'q1', from: 't1', takenBy: null });
    const res = askOrigin(m, 'ft1');
    expect(res).toEqual({
      written: false,
      pen: null,
      icon: 'msg',
      text: 'Asked here, in their own words',
      short: 'Asked here',
    });
  });

  it('handles direct questions viewed by the asker', () => {
    const m = msg({ id: 'q1', from: 't1', takenBy: null });
    const res = askOrigin(m, 't1');
    expect(res).toEqual({
      written: false,
      pen: null,
      icon: 'msg',
      text: 'You asked this here, in your own words',
      short: 'You asked this here',
    });
  });

  it('handles in-person questions viewed by a third party', () => {
    const m = msg({
      id: 'q2',
      from: 't1',
      takenBy: 'ft1',
      takenByName: 'Mei Lin',
    });
    const res = askOrigin(m, 'ft2');
    expect(res).toEqual({
      written: true,
      pen: { uid: 'ft1', name: 'Mei Lin' },
      icon: 'edit',
      text: 'Asked in person · written down by Mei',
      short: 'Written down by Mei',
    });
  });

  it('handles in-person questions viewed by the full-timer who recorded it', () => {
    const m = msg({
      id: 'q2',
      from: 't1',
      takenBy: 'ft1',
      takenByName: 'Mei Lin',
    });
    const res = askOrigin(m, 'ft1');
    expect(res).toEqual({
      written: true,
      pen: { uid: 'ft1', name: 'Mei Lin' },
      icon: 'edit',
      text: 'Asked in person · written down by you',
      short: 'Written down by you',
    });
  });

  it('handles in-person questions viewed by the asker', () => {
    const m = msg({
      id: 'q2',
      from: 't1',
      takenBy: 'ft1',
      takenByName: 'Mei Lin',
    });
    const res = askOrigin(m, 't1');
    expect(res).toEqual({
      written: true,
      pen: { uid: 'ft1', name: 'Mei Lin' },
      icon: 'edit',
      text: 'Asked in person · Mei wrote it down for you',
      short: 'Mei wrote it down for you',
    });
  });

  it('falls back gracefully when takenByName is missing or empty', () => {
    const m = msg({
      id: 'q3',
      from: 't1',
      takenBy: 'ft3',
      takenByName: '',
    });
    const res = askOrigin(m, 'other');
    expect(res).toEqual({
      written: true,
      pen: { uid: 'ft3', name: 'ft3' },
      icon: 'edit',
      text: 'Asked in person · written down by ft3',
      short: 'Written down by ft3',
    });
  });
});