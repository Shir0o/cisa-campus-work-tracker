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

import { get, set, ref, push } from 'firebase/database';
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

// Builds a synthetic append-only log the way the provider's RTDB node fills up:
// one base64 Yjs update per keystroke. `Y.mergeUpdates` over all of them is what
// used to freeze the tab on open; applying them in order is the fix under test.
function u8ToB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function typingLog(n: number): { source: Y.Doc; entries: [string, string][] } {
  const source = new Y.Doc();
  const text = source.getText('md');
  const updates: string[] = [];
  source.on('update', (u: Uint8Array) => updates.push(u8ToB64(u)));
  const words = ['the', 'week', 'meeting', 'leader', 'prayer', 'notes', 'team', 'faith', 'grace'];
  let seed = 1234567;
  let caret = 0;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    if (caret > 0 && rand() < 0.05) {
      text.delete(caret - 1, 1);
      caret -= 1;
    } else if (rand() < 0.05) {
      caret = Math.floor(rand() * (text.length + 1));
    } else {
      const word = `${words[Math.floor(rand() * words.length)]} `;
      caret = Math.min(caret, text.length);
      text.insert(caret, word);
      caret += word.length;
    }
  }
  const entries = updates.map((b64, i): [string, string] => [
    `k${String(i).padStart(6, '0')}`,
    b64,
  ]);
  return { source, entries };
}

function logSnapshot(entries: [string, string][]): { val: () => Record<string, string> } {
  const val: Record<string, string> = {};
  for (const [k, v] of entries) val[k] = v;
  return { val: () => val };
}

describe('RtdbYjsProvider initial load', () => {
  let providers: RtdbYjsProvider[];
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    providers = [];
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    providers.forEach((p) => p.destroy());
    warn.mockRestore();
  });

  const load = (
    doc: Y.Doc,
    snapshot: { val: () => Record<string, string> },
    onSynced?: (degraded: boolean) => void,
  ) => {
    vi.mocked(get).mockResolvedValue(snapshot as never);
    const provider = new RtdbYjsProvider({} as never, DOC_ID, doc, { onSynced });
    providers.push(provider);
    return provider;
  };

  it(
    'loads a ~20k-entry log in well under a second',
    async () => {
      const { source, entries } = typingLog(20000);
      const doc = new Y.Doc();
      let elapsed = 0;
      const start = performance.now();
      const synced = new Promise<boolean>((resolve) => {
        load(doc, logSnapshot(entries), (degraded) => {
          elapsed = performance.now() - start;
          resolve(degraded);
        });
      });

      expect(await synced).toBe(false);
      // The mergeUpdates path took ~20s at this size; ordered application is ~100ms.
      expect(elapsed).toBeLessThan(3000);
      expect(Y.encodeStateVector(doc)).toEqual(Y.encodeStateVector(source));
      expect(doc.getText('md').toString()).toBe(source.getText('md').toString());
      source.destroy();
    },
    30000,
  );

  it('reconstructs the same document as the source for a non-trivial log', async () => {
    const { source, entries } = typingLog(500);
    const doc = new Y.Doc();
    const provider = load(doc, logSnapshot(entries));
    await flush();

    expect(provider.synced).toBe(true);
    expect(Y.encodeStateVector(doc)).toEqual(Y.encodeStateVector(source));
    expect(doc.getText('md').toString()).toBe(source.getText('md').toString());
    source.destroy();
  });

  it('does not push the loaded log back to RTDB', async () => {
    const { source, entries } = typingLog(500);
    const doc = new Y.Doc();
    load(doc, logSnapshot(entries));
    await flush();

    expect(vi.mocked(push)).not.toHaveBeenCalled();
    source.destroy();
  });

  it('skips an undecodable entry without failing the load', async () => {
    const { source, entries } = typingLog(50);
    const withBad = entries.flatMap((entry, i) => (i === 25 ? [['bad', '!!!'] as [string, string], entry] : [entry]));
    const doc = new Y.Doc();
    let degraded: boolean | null = null;
    load(doc, logSnapshot(withBad), (d) => (degraded = d));
    await flush();

    expect(degraded).toBe(false);
    expect(doc.getText('md').toString()).toBe(source.getText('md').toString());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('undecodable'), expect.anything());
    source.destroy();
  });
});

describe('RtdbYjsProvider base path', () => {
  it('places updates, awareness and the seed flag under a custom base path', async () => {
    vi.clearAllMocks();
    vi.mocked(get).mockResolvedValue(emptySnap as never);
    const doc = new Y.Doc();
    // The Meeting editor replicates over `bible_study_meetings_rtdb` (ADR 0012
    // §2); the Board pages path must remain the default for CoordinationNotes.
    const provider = new RtdbYjsProvider({} as never, 'meeting-1', doc, {
      basePath: 'bible_study_meetings_rtdb',
    });
    await flush();

    const paths = vi.mocked(ref).mock.calls.map(([, p]) => p);
    expect(paths).toContain('bible_study_meetings_rtdb/meeting-1/updates');
    expect(paths).toContain('bible_study_meetings_rtdb/meeting-1/awareness');
    expect(paths).toContain('bible_study_meetings_rtdb/meeting-1/seeded');
    expect(paths).not.toContain('board_docs_rtdb/meeting-1/updates');

    doc.getArray('md').insert(0, ['hello']);
    await flush();
    expect(vi.mocked(push)).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'bible_study_meetings_rtdb/meeting-1/updates' }),
      expect.any(String),
    );

    provider.destroy();
    doc.destroy();
  });

  it('defaults to the board_docs_rtdb base path', async () => {
    vi.clearAllMocks();
    vi.mocked(get).mockResolvedValue(emptySnap as never);
    const doc = new Y.Doc();
    const provider = new RtdbYjsProvider({} as never, 'doc-9', doc);
    await flush();

    const paths = vi.mocked(ref).mock.calls.map(([, p]) => p);
    expect(paths).toContain('board_docs_rtdb/doc-9/updates');

    provider.destroy();
    doc.destroy();
  });
});
