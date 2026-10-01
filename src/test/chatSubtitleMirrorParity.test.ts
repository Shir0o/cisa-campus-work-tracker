// Mirror parity (ADR 0033 §6): the web app's chat subtitle/audience copy
// (src/components/stream/chatAdapter.ts) and the shared core one
// (packages/core/src/chat.ts) must read the same, or a chat header or an
// announcement composer's audience line differs between the web and the phone.
// The web app deliberately has no @cisa/core dependency, so the two copies
// cannot share an import; this corpus is the contract between them (the same
// shape as streamMirrorParity.test.ts).
import { describe, it, expect, vi } from 'vitest';
import { chatAudienceNote, chatRoomSubtitle as webSubtitle } from '../components/stream/chatAdapter';
import { announcementAudienceNote as coreAudience, chatRoomSubtitle as coreSubtitle } from '../../packages/core/src/chat';
import en from '../locales/en.json';
import type { ChatRoom } from '../types';

vi.mock('../services/chat', () => ({ sendMessage: vi.fn().mockResolvedValue(undefined) }));

/** The web dictionary as the `t` both copies read. */
function t(key: string): string {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
  return typeof v === 'string' ? v : key;
}

const room = (over: Partial<ChatRoom> = {}): ChatRoom => ({
  id: 'r1',
  type: 'group',
  name: 'Thursday table crew',
  memberIds: ['me', 'josh', 'grace'],
  createdById: 'me',
  createdByName: 'Maria Santos',
  createdAt: { seconds: 1 },
  ...over,
});

const admin = (displayName: string) => ({ uid: displayName.toLowerCase(), displayName, role: 'admin' });
const trainee = (displayName: string) => ({ uid: displayName.toLowerCase(), displayName, role: 'manager' });

const ROOMS: ChatRoom[] = [
  room({ type: 'direct', memberIds: ['me', 'grace'] }),
  room({ type: 'group', memberIds: ['me'] }),
  room({ type: 'group', memberIds: ['me', 'josh', 'grace', 'maria'] }),
  room({ type: 'announcement', memberIds: ['me', 'maria'] }),
  room({ type: 'announcement', memberIds: ['me', 'maria', 'grace'] }),
  room({ type: 'announcement', memberIds: ['me', 'maria', 'grace', 'josh', 'ana'] }),
  room({ type: 'announcement', memberIds: [] }),
  room({ type: 'announcement', memberIds: ['a', 'b'], audiencePreset: 'everyone' }),
  room({ type: 'announcement', memberIds: ['a'], audiencePreset: 'custom' }),
];
const MEMBERS = [
  [],
  [admin('Maria Santos')],
  [admin('Maria Santos'), admin('Grace Liu')],
  [admin('Maria Santos'), admin('Grace Liu'), admin('Josh Park')],
  [trainee('Ana Beltrán')],
  [trainee('Ana Beltrán'), admin('Grace Liu')],
];

describe('chat subtitle mirror parity (ADR 0033)', () => {
  it('web and core name every room the same, for every roster and viewer', () => {
    let cases = 0;
    for (const r of ROOMS) {
      for (const members of MEMBERS) {
        for (const meIsFullTimer of [false, true]) {
          expect(coreSubtitle(r, { members, meIsFullTimer, t })).toBe(
            webSubtitle(r, { members, meIsFullTimer, t }),
          );
          cases += 1;
        }
      }
    }
    expect(cases).toBe(9 * 6 * 2);
  });

  it('web and core name an announcement composer audience the same, for each preset', () => {
    for (const r of ROOMS) {
      expect(coreAudience(r, t)).toBe(chatAudienceNote(r, t));
    }
  });
});
