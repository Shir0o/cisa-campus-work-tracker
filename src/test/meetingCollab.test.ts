import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { get } from 'firebase/database';

// The realtime pieces are exercised through the mock like the provider tests
// do; this file pins the editor-facing logic around them.
const disconnectRemove = vi.fn();
const disconnectCancel = vi.fn();

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  child: vi.fn((parent: { path: string }, key: string) => ({ path: `${parent.path}/${key}` })),
  push: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({ val: () => null }),
  set: vi.fn().mockResolvedValue(undefined),
  onChildAdded: vi.fn(() => () => {}),
  onChildChanged: vi.fn(() => () => {}),
  onChildRemoved: vi.fn(() => () => {}),
  onDisconnect: vi.fn(() => ({ remove: disconnectRemove, cancel: disconnectCancel })),
  runTransaction: vi.fn(),
}));

import { RtdbYjsProvider } from '../lib/yjsRtdbProvider';
import { MeetingCollab, MEETING_RTDB_BASE } from '../lib/meetingCollab';
import { peersFromAwareness, colorFor } from '../lib/presence';

describe('MEETING_RTDB_BASE', () => {
  it('is the meetings realtime path the rules gate', () => {
    expect(MEETING_RTDB_BASE).toBe('bible_study_meetings_rtdb');
  });
});

describe('MeetingCollab', () => {
  let ydoc: Y.Doc;
  let collab: MeetingCollab | null;
  let claimSeedMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    ydoc = new Y.Doc();
    collab = null;
    claimSeedMock = vi.spyOn(RtdbYjsProvider.prototype, "claimSeed").mockResolvedValue(false);
  });

  afterEach(() => {
    collab?.destroy();
    ydoc.destroy();
  });

  const start = (md: string, onStatus?: (s: { live: boolean; degraded: boolean }) => void) => {
    const c = new MeetingCollab(ydoc, {
      meetingId: 'meeting-1',
      rtdb: {} as never,
      me: { uid: 'u-me', name: 'Ana' },
      storedMd: md,
      onStatus,
    });
    collab = c;
    return c;
  };

  it('exposes the doc text, seeded once from the stored markdown', async () => {
    claimSeedMock.mockResolvedValue(true);
    const c = start('## Seed\n- from firestore');
    await c.ready;
    expect(c.text.toString()).toBe('## Seed\n- from firestore');

    // A second opener loses the seed claim and never overwrites live content.
    claimSeedMock.mockResolvedValue(false);
    const second = new MeetingCollab(new Y.Doc(), {
      meetingId: 'meeting-1',
      rtdb: {} as never,
      me: { uid: 'u-other', name: 'Bob' },
      storedMd: '## Seed\n- from firestore',
    });
    await second.ready;
    expect(second.text.toString()).toBe('');
    second.destroy();
  });

  it('applies a remote update arriving through the shared doc', async () => {
    const c = start('');
    await c.ready;

    // A peer's edit arrives through the provider's update log.
    const peerDoc = new Y.Doc();
    peerDoc.getText('md').insert(0, 'peer line');
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(peerDoc), 'remote-origin');
    expect(c.text.toString()).toBe('peer line');
    peerDoc.destroy();
  });

  it('local edits flow through the Y.Text', async () => {
    const c = start('');
    await c.ready;

    c.applyLocalEdit(0, 0, 'hello');
    expect(c.text.toString()).toBe('hello');
  });

  it('reports no peers with an empty awareness room', async () => {
    const c = start('');
    await c.ready;

    expect(peersFromAwareness(c.awareness.getStates(), c.awareness.clientID, 'u-me')).toHaveLength(0);
  });

  it('sets its own user state for others to see', async () => {
    const c = start('');
    await c.ready;
    const mine = c.awareness.getLocalState() as { user?: { uid: string; name: string; color: string } };
    expect(mine.user?.uid).toBe('u-me');
    expect(mine.user?.name).toBe('Ana');
    expect(mine.user?.color).toBe(colorFor('u-me'));
  });

  it('surfaces degraded status when the initial read fails, without seeding', async () => {
    vi.mocked(get).mockRejectedValueOnce(new Error('offline'));
    const statuses: Array<{ live: boolean; degraded: boolean }> = [];
    const d = new MeetingCollab(new Y.Doc(), {
      meetingId: 'meeting-1',
      rtdb: {} as never,
      me: { uid: 'u-me', name: 'Ana' },
      storedMd: 'stored copy',
      onStatus: (s) => statuses.push(s),
    });
    await d.ready;
    expect(statuses).toContainEqual({ live: false, degraded: true });
    // Degraded means single-user: the stored copy is shown, not a blank pane.
    expect(d.text.toString()).toBe('stored copy');
    expect(claimSeedMock).not.toHaveBeenCalled();
    d.destroy();
  });

  it('fires live status when the room connects', async () => {
    const statuses: Array<{ live: boolean; degraded: boolean }> = [];
    const c = start('stored', (s) => statuses.push(s));
    await c.ready;
    expect(statuses).toContainEqual({ live: true, degraded: false });
  });

  it('cleans up the provider on destroy', async () => {
    const c = start('');
    await c.ready;
    const spy = vi.spyOn(RtdbYjsProvider.prototype, 'destroy');
    c.destroy();
    expect(spy).toHaveBeenCalled();
    collab = null;
  });
});