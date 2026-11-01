/**
 * The bar's own waiting count (#1806, ADR 0049).
 *
 * A trainee is staff enough to read the asks feed (`askVisibleFor`) but is owed
 * a different number than a full-timer: their unread is replies on their own
 * questions, never the team's backlog (#563). This hook is the bar's copy of
 * that reading, so it must agree with the Messages channel header rather than
 * invent a third one.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AskMessage } from '../lib/asks';
import { __resetInboxReadsCache, InboxReads } from '../lib/inboxReads';

const feed: { cb: ((m: AskMessage[]) => void) | null; subscribes: number } = {
  cb: null,
  subscribes: 0,
};

vi.mock('../lib/asks', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../lib/asks');
  return {
    ...actual,
    subscribeAsks: vi.fn((cb: (m: AskMessage[]) => void) => {
      feed.cb = cb;
      feed.subscribes += 1;
      return () => {
        feed.cb = null;
      };
    }),
  };
});

// Imported after the mock so the hook picks up the stubbed feed.
const { useMyAskRepliesCount } = await import('../hooks/useMyAskRepliesCount');

const myQuestion: AskMessage = {
  id: 'q-mine',
  parentId: null,
  owner: 'trainee-1',
  from: 'trainee-1',
  fromName: 'Ana Lei',
  kind: 'question',
  body: 'How do I start a conversation at the table?',
  at: '2026-10-01T10:00:00.000Z',
};

const replyOnMine: AskMessage = {
  id: 'r-on-mine',
  parentId: 'q-mine',
  owner: 'trainee-1',
  from: 'fulltimer-1',
  fromName: 'Mei Lin',
  kind: 'comment',
  body: 'Ask about their week first.',
  at: '2026-10-02T10:00:00.000Z',
};

const someoneElsesQuestion: AskMessage = {
  id: 'q-theirs',
  parentId: null,
  owner: 'trainee-2',
  from: 'trainee-2',
  fromName: 'Zion Park',
  kind: 'question',
  body: 'What do I bring on Saturday?',
  at: '2026-10-03T10:00:00.000Z',
};

describe('useMyAskRepliesCount (#1806)', () => {
  beforeEach(() => {
    feed.cb = null;
    feed.subscribes = 0;
    __resetInboxReadsCache();
  });

  it('counts replies on the reader\'s own questions', async () => {
    const { result } = renderHook(() => useMyAskRepliesCount('trainee-1'));
    expect(feed.subscribes).toBe(1);
    act(() => feed.cb!([myQuestion, replyOnMine]));
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('never carries the team\'s backlog', async () => {
    const { result } = renderHook(() => useMyAskRepliesCount('trainee-1'));
    // Someone else's question, answered by a full-timer: the trainee is not owed
    // anything by it, so the bar stays clean.
    act(() =>
      feed.cb!([
        someoneElsesQuestion,
        {
          id: 'r-on-theirs',
          parentId: 'q-theirs',
          owner: 'trainee-2',
          from: 'fulltimer-1',
          fromName: 'Mei Lin',
          kind: 'comment',
          body: 'Bring a jacket.',
          at: '2026-10-04T10:00:00.000Z',
        },
      ]),
    );
    await waitFor(() => expect(result.current).toBe(0));
  });

  it('drops as soon as the reply is read', async () => {
    const { result } = renderHook(() => useMyAskRepliesCount('trainee-1'));
    act(() => feed.cb!([myQuestion, replyOnMine]));
    await waitFor(() => expect(result.current).toBe(1));
    act(() => InboxReads.markRead('trainee-1', 'ask:r-on-mine'));
    await waitFor(() => expect(result.current).toBe(0));
  });

  it('stays at zero and subscribes to nothing without a reader', () => {
    const { result } = renderHook(() => useMyAskRepliesCount(null));
    expect(result.current).toBe(0);
    expect(feed.subscribes).toBe(0);
  });
});
