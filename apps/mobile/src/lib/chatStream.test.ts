import type { ChatMessage } from '@cisa/core';
import {
  goneLabelOf,
  heldPosts,
  isPostAcknowledged,
  mentionParts,
  pinnedLabelOf,
  readMarkOf,
  toChatStreamMessage,
} from './chatStream';

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  roomId: 'r1',
  text: id,
  senderId: 'maria',
  senderName: 'Maria Santos',
  timestamp: '2026-09-28T10:00:00.000Z',
  type: 'text',
  ...over,
});

const t = (key: string) =>
  ({
    'mobile.messages.pinned_by': 'Pinned by {name} · until they unpin it',
    'mobile.messages.pinned_by_you': 'Pinned by you · until you unpin it',
    'mobile.messages.gone_you_took_back': 'You took this message back.',
    'mobile.messages.gone_you_removed': 'You removed this message.',
    'mobile.messages.gone_took_back': '{name} took this message back.',
    'mobile.messages.gone_removed_by': 'Removed by {name}.',
  })[key] ?? key;
const nameOf = (uid: string, fallback: string) => ({ grace: 'Grace Liu', tony: 'Tony Wang' })[uid] ?? fallback;

describe('toChatStreamMessage', () => {
  it('reads a chat message as the stream model does: the sender is the author, the text the body', () => {
    const m = toChatStreamMessage(msg('m1', { parentId: 'm0' }));
    expect(m).toMatchObject({ id: 'm1', parentId: 'm0', from: 'maria', fromName: 'Maria Santos', body: 'm1', at: '2026-09-28T10:00:00.000Z' });
  });

  it('reads a not-yet-stamped message (a pending server time) as now', () => {
    const before = Date.now();
    const m = toChatStreamMessage(msg('m1', { timestamp: null }));
    expect(new Date(m.at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('gives a system notice its own author, so the next message is not folded into it', () => {
    const notice = toChatStreamMessage(msg('n1', { type: 'system', senderName: 'System' }));
    expect(notice.from).not.toBe('maria');
  });
});

describe('the pinned post', () => {
  const pinned = toChatStreamMessage(msg('p', { pinned: true, pinnedBy: 'grace' }));
  const plain = toChatStreamMessage(msg('q'));

  it('is held first, in an announcement only', () => {
    expect(heldPosts([plain, pinned], true).map((m) => m.id)).toEqual(['p']);
    expect(heldPosts([plain, pinned], false)).toEqual([]);
  });

  it('holds a top-level post only, and never a taken-back one', () => {
    const reply = toChatStreamMessage(msg('r', { pinned: true, parentId: 'q' }));
    const gone = toChatStreamMessage(msg('g', { pinned: true, deleted: { by: 'maria', at: null } }));
    expect(heldPosts([reply, gone], true)).toEqual([]);
  });

  it('says who pinned it, or that you did', () => {
    expect(pinnedLabelOf(pinned, { me: 'tony', nameOf, t })).toBe('Pinned by Grace Liu · until they unpin it');
    expect(pinnedLabelOf(pinned, { me: 'grace', nameOf, t })).toBe('Pinned by you · until you unpin it');
  });

  it('credits the author when nobody is recorded as pinning it', () => {
    const m = toChatStreamMessage(msg('p2', { pinned: true }));
    expect(pinnedLabelOf(m, { me: 'tony', nameOf, t })).toBe('Pinned by Maria Santos · until they unpin it');
  });
});

describe('a taken-back message', () => {
  const gone = (by: string, sender = 'maria') =>
    toChatStreamMessage(msg('g', { senderId: sender, deleted: { by, at: null } }));

  it('has no label while it is live', () => {
    expect(goneLabelOf(toChatStreamMessage(msg('m')), { me: 'tony', nameOf, t })).toBeNull();
  });

  it('says who took it back — you, the author, or a Full-timer', () => {
    expect(goneLabelOf(gone('tony', 'tony'), { me: 'tony', nameOf, t })).toBe('You took this message back.');
    expect(goneLabelOf(gone('tony'), { me: 'tony', nameOf, t })).toBe('You removed this message.');
    expect(goneLabelOf(gone('maria'), { me: 'tony', nameOf, t })).toBe('Maria took this message back.');
    expect(goneLabelOf(gone('grace'), { me: 'tony', nameOf, t })).toBe('Removed by Grace.');
  });
});

describe('Got it', () => {
  it('is whether the viewer is in acknowledged', () => {
    expect(isPostAcknowledged(msg('m', { acknowledged: ['u1'] }), 'u1')).toBe(true);
    expect(isPostAcknowledged(msg('m', { acknowledged: ['u2'] }), 'u1')).toBe(false);
    expect(isPostAcknowledged(msg('m'), 'u1')).toBe(false);
  });
});

describe('the New line mark', () => {
  it("is the room's last-read as an ISO time, or nothing if it was never opened", () => {
    expect(readMarkOf(Date.parse('2026-09-28T10:00:00.000Z'))).toBe('2026-09-28T10:00:00.000Z');
    expect(readMarkOf(null)).toBeNull();
  });
});

describe('@mentions', () => {
  const names = ['Maria Santos', 'Grace Liu'];

  it('picks out a full name and a hand-typed first name, in any case', () => {
    expect(mentionParts('Thanks @Maria Santos and @grace!', names)).toEqual([
      { text: 'Thanks ', mention: false },
      { text: '@Maria Santos', mention: true },
      { text: ' and ', mention: false },
      { text: '@grace', mention: true },
      { text: '!', mention: false },
    ]);
  });

  it('leaves alone an @ that is not a teammate, or only the start of a longer word', () => {
    expect(mentionParts('hi @Mariana and @josh', names)).toEqual([{ text: 'hi @Mariana and @josh', mention: false }]);
  });

  it('is the text untouched when there is nobody to mention', () => {
    expect(mentionParts('hi @maria', [])).toEqual([{ text: 'hi @maria', mention: false }]);
  });
});
