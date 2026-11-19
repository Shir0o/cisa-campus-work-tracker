import type { ThreadMessage } from '@cisa/core';
import { conversationMessages } from './contactStreams';

const msg = (id: string, over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id,
  interactionId: null,
  from: 'grace',
  fromName: 'Grace Liu',
  kind: 'comment',
  body: id,
  at: '2026-09-28T10:00:00.000Z',
  ...over,
});

const open = msg('open');
const reply = msg('reply', { parentId: 'open', at: '2026-09-28T10:10:00.000Z' });
const team = msg('team', { scope: 'team' });
const onInteraction = msg('on-int', { interactionId: 'int1', at: '2026-09-28T11:00:00.000Z' });
const teamOnInteraction = msg('team-int', { interactionId: 'int1', scope: 'team' });
const all = [open, reply, team, onInteraction, teamOnInteraction];

describe('the Conversation', () => {
  it('is the contact-level open stream: no Interaction threads, no legacy staff-only messages', () => {
    expect(conversationMessages(all).map((m) => m.id)).toEqual(['open', 'reply']);
  });
});
