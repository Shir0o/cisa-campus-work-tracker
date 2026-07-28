import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
// Presence lives at `board_docs_rtdb/{docId}/awareness/{clientId}`, and a node left
// behind there is a ghost editor that every future reader sees. These tests pin the
// three rules that keep the node from outliving its client.
const disconnectRemove = vi.fn();
const disconnectCancel = vi.fn();

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  child: vi.fn((parent: { path: string }, key: string) => ({ path: `${parent.path}/${key}` })),
  push: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  onChildAdded: vi.fn(() => () => {}),
  onChildChanged: vi.fn(() => () => {}),
  onChildRemoved: vi.fn(() => () => {}),
  onDisconnect: vi.fn(() => ({ remove: disconnectRemove, cancel: disconnectCancel })),
  runTransaction: vi.fn(),
}));

import { get, set } from 'firebase/database';
import { RtdbYjsProvider } from '../lib/yjsRtdbProvider';

const DOC_ID = 'doc-1';
const flush = () => new Promise((r) => setTimeout(r, 0));
const emptySnap = { val: () => null };

/** Every `set` issued against the doc's awareness subtree. */
const awarenessWrites = () =>
  vi.mocked(set).mock.calls.filter(([r]) =>
    (r as unknown as { path: string }).path.startsWith(`board_docs_rtdb/${DOC_ID}/awareness`),
  );

describe('RtdbYjsProvider presence', () => {
  let doc: Y.Doc;
  let awareness: Awareness;
  let provider: RtdbYjsProvider | null;

  beforeEach(() => {
    vi.clearAllMocks();
    doc = new Y.Doc();
    awareness = new Awareness(doc);
    provider = null;
  });

  afterEach(() => {
    provider?.destroy();
    doc.destroy();
  });

  const start = () => {
    provider = new RtdbYjsProvider({} as never, DOC_ID, doc, { awareness });
    return provider;
  };

  it('publishes nothing until onDisconnect is armed', async () => {
    let release!: (snap: unknown) => void;
    vi.mocked(get).mockReturnValue(new Promise((r) => (release = r)) as never);
    start();

    // The caret extension sets `user` as soon as the editor view mounts — which can
    // land before the initial read resolves. Writing then would leave an unreapable node.
    awareness.setLocalStateField('user', { name: 'Tony Wang' });
    await flush();
    expect(awarenessWrites()).toHaveLength(0);

    release(emptySnap);
    await flush();
    expect(disconnectRemove).toHaveBeenCalled();
    expect(awarenessWrites().length).toBeGreaterThan(0);
  });

  it('publishes nothing at all when the initial read fails (degraded)', async () => {
    vi.mocked(get).mockRejectedValue(new Error('permission denied') as never);
    start();
    await flush();

    awareness.setLocalStateField('user', { name: 'Tony Wang' });
    await flush();

    expect(disconnectRemove).not.toHaveBeenCalled();
    expect(awarenessWrites()).toHaveLength(0);
  });

  it('clears its own node on destroy without disarming onDisconnect first', async () => {
    vi.mocked(get).mockResolvedValue(emptySnap as never);
    const p = start();
    await flush();

    p.destroy();
    provider = null;

    expect(disconnectCancel).not.toHaveBeenCalled();
    expect(vi.mocked(set)).toHaveBeenCalledWith(
      expect.objectContaining({ path: `board_docs_rtdb/${DOC_ID}/awareness/${awareness.clientID}` }),
      null,
    );
  });

  it('reaps a peer node once awareness times the peer out', async () => {
    vi.mocked(get).mockResolvedValue(emptySnap as never);
    start();
    await flush();

    const ghostDoc = new Y.Doc();
    const ghost = new Awareness(ghostDoc);
    ghost.setLocalStateField('user', { name: 'Kevin Munga' });
    applyAwarenessUpdate(awareness, encodeAwarenessUpdate(ghost, [ghost.clientID]), 'remote');
    expect(awareness.getStates().has(ghost.clientID)).toBe(true);

    // What the 30s staleness sweep inside y-protocols does to a client that stopped
    // heartbeating. Locally that only hides it — the RTDB node has to go too.
    removeAwarenessStates(awareness, [ghost.clientID], 'timeout');

    expect(vi.mocked(set)).toHaveBeenCalledWith(
      expect.objectContaining({ path: `board_docs_rtdb/${DOC_ID}/awareness/${ghost.clientID}` }),
      null,
    );
    ghostDoc.destroy();
  });

  it('does not re-delete a peer that left cleanly', async () => {
    vi.mocked(get).mockResolvedValue(emptySnap as never);
    start();
    await flush();
    vi.mocked(set).mockClear();

    const ghostDoc = new Y.Doc();
    const ghost = new Awareness(ghostDoc);
    ghost.setLocalStateField('user', { name: 'Kevin Munga' });
    applyAwarenessUpdate(awareness, encodeAwarenessUpdate(ghost, [ghost.clientID]), 'remote');

    // onChildRemoved feeds removals back with the provider as origin: RTDB already
    // dropped the node, so writing null again would be pure churn.
    removeAwarenessStates(awareness, [ghost.clientID], provider);

    expect(awarenessWrites()).toHaveLength(0);
    ghostDoc.destroy();
  });
});

describe('RtdbYjsProvider unload handling', () => {
  it('listens for pagehide as well as beforeunload', async () => {
    vi.clearAllMocks();
    vi.mocked(get).mockResolvedValue(emptySnap as never);
    const spy = vi.spyOn(window, 'addEventListener');
    const doc = new Y.Doc();
    const provider = new RtdbYjsProvider({} as never, DOC_ID, doc);
    await flush();

    const events = spy.mock.calls.map(([e]) => e);
    // beforeunload never fires in iOS Safari / the mobile WebView; pagehide does.
    expect(events).toContain('beforeunload');
    expect(events).toContain('pagehide');

    provider.destroy();
    doc.destroy();
    spy.mockRestore();
  });
});
