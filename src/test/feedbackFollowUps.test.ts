import { describe, it, expect } from 'vitest';
import { followUpSummary } from '../lib/feedbackFollowUps';

// A note that has the server-written follow-up facts.
const counted = (over: Record<string, unknown> = {}) => ({
  replyCount: 2,
  lastReplyAt: '2026-09-04T12:00:00.000Z',
  lastReplyRole: 'team' as const,
  ...over,
});

const at = (iso: string) => Date.parse(iso);

describe('followUpSummary', () => {
  it('reports how many follow-ups a note holds', () => {
    expect(followUpSummary(counted(), null).count).toBe(2);
  });

  it('knows nothing about a note written before the fields existed', () => {
    // No `replyCount`, no `lastReplyAt`: the card falls back to today's label
    // rather than claiming a number it cannot know.
    expect(followUpSummary({}, null)).toEqual({ count: null, isNew: false });
  });

  it('treats a zero or malformed count as not known', () => {
    expect(followUpSummary(counted({ replyCount: 0 }), null).count).toBeNull();
    expect(followUpSummary(counted({ replyCount: Number.NaN }), null).count).toBeNull();
    expect(followUpSummary(counted({ replyCount: '2' }), null).count).toBeNull();
  });

  it('marks a team reply newer than the reader’s last visit as new', () => {
    const summary = followUpSummary(counted(), at('2026-09-03T09:00:00.000Z'));
    expect(summary).toEqual({ count: 2, isNew: true });
  });

  it('does not mark a reply the reader has already seen', () => {
    const summary = followUpSummary(counted(), at('2026-09-05T09:00:00.000Z'));
    expect(summary.isNew).toBe(false);
  });

  it('does not mark the reader’s own last follow-up as new', () => {
    const summary = followUpSummary(counted({ lastReplyRole: 'submitter' }), at('2026-09-03T09:00:00.000Z'));
    expect(summary.isNew).toBe(false);
  });

  it('has no baseline on a first visit, so it claims nothing is new', () => {
    expect(followUpSummary(counted(), null)).toEqual({ count: 2, isNew: false });
  });

  it('ignores a last-reply time it cannot read', () => {
    const summary = followUpSummary(counted({ lastReplyAt: 'not-a-date' }), at('2026-09-03T09:00:00.000Z'));
    expect(summary.isNew).toBe(false);
  });
});
