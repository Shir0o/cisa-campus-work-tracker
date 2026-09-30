import type { Interaction, ThreadMessage } from '@cisa/core';
import { conversationMessages, fullTimersMessages, interactionThread } from './contactStreams';

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
  it('is the contact-level open stream: no Interaction threads, no staff-only messages', () => {
    expect(conversationMessages(all).map((m) => m.id)).toEqual(['open', 'reply']);
  });
});

describe('the Full-timers stream', () => {
  it('is every staff-only message and nothing else', () => {
    expect(fullTimersMessages(all).map((m) => m.id)).toEqual(['team', 'team-int']);
  });
});

describe("an Interaction's Thread", () => {
  const interaction = {
    id: 'int1',
    userId: 'josh',
    userName: 'Josh Park',
    content: 'Sat with Daniel on Thursday.',
    dateTime: '2026-09-27T18:00:00.000Z',
    createdAt: '2026-09-27T18:05:00.000Z',
    type: 'chat',
  } as Interaction;

  it('quotes the Interaction as its parent and holds its open replies', () => {
    const thread = interactionThread({
      interaction,
      messages: all,
      viewer: { uid: 'grace', role: 'manager' },
      now: new Date('2026-09-28T12:00:00.000Z'),
    });

    expect(thread.parent.message).toMatchObject({ from: 'josh', fromName: 'Josh Park', body: 'Sat with Daniel on Thursday.' });
    expect(thread.parent.thread?.count).toBe(1);
    expect(thread.replies.map((r) => r.message.id)).toEqual(['on-int']);
  });

  it('has no replies before anyone thinks it through', () => {
    const thread = interactionThread({
      interaction: { ...interaction, id: 'int2' },
      messages: all,
      viewer: { uid: 'grace', role: 'manager' },
      now: new Date('2026-09-28T12:00:00.000Z'),
    });
    expect(thread.parent.thread).toBeNull();
    expect(thread.replies).toEqual([]);
  });
});
