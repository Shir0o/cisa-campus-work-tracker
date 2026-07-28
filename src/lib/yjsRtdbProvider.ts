// A small Yjs ⇄ Firebase Realtime Database provider.
//
// There's no well-maintained off-the-shelf RTDB provider for Yjs, so this is a
// purpose-built one for The Board. It keeps the document in sync by appending
// Yjs updates to an RTDB list and replaying them, and carries presence/cursors
// through an ephemeral awareness node that self-cleans on disconnect.
//
// Layout under `board_docs_rtdb/{docId}`:
//   updates/{pushId}      → base64 Yjs update (append-only log)
//   awareness/{clientId}  → base64 awareness update (ephemeral; onDisconnect-removed)
//   seeded                → bool flag guarding first-time content seeding
//
// Updates are idempotent in Yjs, so replaying the log (even with overlap) is
// safe. Compaction of the log is intentionally omitted — this is an admin-only,
// low-volume surface; revisit if a single page ever accumulates huge histories.

import * as Y from 'yjs';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import {
  ref,
  child,
  push,
  get,
  set,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  runTransaction,
  type Database,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';

// ── base64 <-> Uint8Array (RTDB stores JSON strings) ──────────────────────────
function u8ToB64(u8: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)));
  }
  return btoa(s);
}
function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export interface RtdbProviderOptions {
  awareness?: Awareness;
  // `degraded` is true when the initial RTDB read failed (e.g. permission denied, or
  // the DB is unreachable). The consumer should fall back to a local/Firestore-only
  // copy instead of waiting on live sync that will never arrive.
  onSynced?: (degraded: boolean) => void;
}

export class RtdbYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  synced = false;

  private base: DatabaseReference;
  private updatesRef: DatabaseReference;
  private awarenessRef: DatabaseReference;
  private myAwarenessRef: DatabaseReference;
  private seededRef: DatabaseReference;

  private unsubs: Unsubscribe[] = [];
  private appliedKeys = new Set<string>();
  private destroyed = false;
  private onSynced?: (degraded: boolean) => void;
  // Only true once `onDisconnect` is armed. Publishing before that (or in degraded
  // mode, where it's never armed) writes a presence node nothing can ever remove.
  private presenceArmed = false;

  constructor(database: Database, docId: string, doc: Y.Doc, opts: RtdbProviderOptions = {}) {
    this.doc = doc;
    this.awareness = opts.awareness ?? new Awareness(doc);
    this.onSynced = opts.onSynced;

    this.base = ref(database, `board_docs_rtdb/${docId}`);
    this.updatesRef = ref(database, `board_docs_rtdb/${docId}/updates`);
    this.awarenessRef = ref(database, `board_docs_rtdb/${docId}/awareness`);
    this.myAwarenessRef = ref(database, `board_docs_rtdb/${docId}/awareness/${this.awareness.clientID}`);
    this.seededRef = ref(database, `board_docs_rtdb/${docId}/seeded`);

    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
    // `beforeunload` never fires in iOS Safari or the mobile WebView — `pagehide`
    // does, and is the last chance to drop our node before onDisconnect has to.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleUnload);
      window.addEventListener('pagehide', this.handleUnload);
    }

    void this.bootstrap();
  }

  // Load the existing log once, then listen for new updates. Re-applying an
  // already-seen update is harmless, but we track keys to avoid the churn.
  private async bootstrap() {
    let degraded = false;
    try {
      const snap = await get(this.updatesRef);
      if (this.destroyed) return;
      const val = snap.val() as Record<string, string> | null;
      if (val) {
        const entries = Object.entries(val);
        const merged = entries.map(([k, b64]) => {
          this.appliedKeys.add(k);
          return b64ToU8(b64);
        });
        if (merged.length) Y.applyUpdate(this.doc, Y.mergeUpdates(merged), this);
      }
    } catch (e) {
      degraded = true;
      console.warn('[RtdbYjsProvider] initial load failed', e);
    }
    if (this.destroyed) return;

    this.synced = true;
    this.onSynced?.(degraded);

    // Couldn't reach RTDB (denied/offline): writes would fail too, so skip wiring up
    // live listeners and presence — the consumer falls back to a Firestore-only copy.
    if (degraded) return;

    // live document updates
    this.unsubs.push(
      onChildAdded(this.updatesRef, (snap) => {
        const key = snap.key;
        if (!key || this.appliedKeys.has(key)) return;
        this.appliedKeys.add(key);
        const b64 = snap.val() as string;
        if (b64) Y.applyUpdate(this.doc, b64ToU8(b64), this);
      }),
    );

    // remote awareness
    const applyAw = (snap: { key: string | null; val: () => unknown }) => {
      if (!snap.key || Number(snap.key) === this.awareness.clientID) return;
      const b64 = snap.val() as string;
      if (b64) applyAwarenessUpdate(this.awareness, b64ToU8(b64), this);
    };
    this.unsubs.push(onChildAdded(this.awarenessRef, applyAw));
    this.unsubs.push(onChildChanged(this.awarenessRef, applyAw));
    this.unsubs.push(
      onChildRemoved(this.awarenessRef, (snap) => {
        if (!snap.key || Number(snap.key) === this.awareness.clientID) return;
        removeAwarenessStates(this.awareness, [Number(snap.key)], this);
      }),
    );

    // publish our presence + auto-remove it when we disconnect
    onDisconnect(this.myAwarenessRef).remove();
    this.presenceArmed = true;
    this.publishAwareness();
  }

  // Should this client write the initial content? First caller wins via a
  // transaction so two simultaneously-opening editors never double-seed.
  async claimSeed(): Promise<boolean> {
    try {
      const res = await runTransaction(this.seededRef, (cur) => (cur ? undefined : true));
      return !!res.committed && res.snapshot.val() === true && !this.seenAnyUpdate();
    } catch {
      return false;
    }
  }

  private seenAnyUpdate(): boolean {
    return this.appliedKeys.size > 0;
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.destroyed) return; // don't echo remote-applied updates
    push(this.updatesRef, u8ToB64(update)).catch((e) =>
      console.warn('[RtdbYjsProvider] push update failed', e),
    );
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || this.destroyed) return;
    // y-protocols drops a peer that hasn't heartbeated in 30s, but only from our own
    // copy — the RTDB node lives on and haunts everyone who opens the page next. Take
    // it out too. A peer that was merely offline republishes on its next heartbeat.
    if (origin === 'timeout') this.reap(removed);
    const mine = this.awareness.clientID;
    if ([...added, ...updated, ...removed].includes(mine)) this.publishAwareness();
  };

  private reap(clientIds: number[]) {
    for (const id of clientIds) {
      if (id === this.awareness.clientID) continue;
      set(child(this.awarenessRef, String(id)), null).catch(() => {});
    }
  }

  private publishAwareness() {
    if (this.destroyed || !this.presenceArmed) return;
    const state = this.awareness.getLocalState();
    if (state == null) {
      set(this.myAwarenessRef, null).catch(() => {});
      return;
    }
    const enc = encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
    set(this.myAwarenessRef, u8ToB64(enc)).catch((e) =>
      console.warn('[RtdbYjsProvider] publish awareness failed', e),
    );
  }

  private handleUnload = () => {
    set(this.myAwarenessRef, null).catch(() => {});
  };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleUnload);
      window.removeEventListener('pagehide', this.handleUnload);
    }
    this.unsubs.forEach((u) => {
      try {
        u();
      } catch {
        /* noop */
      }
    });
    this.unsubs = [];
    // Deliberately leave the onDisconnect armed: this write is best-effort, and if the
    // tab closes before it lands, the server-side remove is the only thing left that
    // can clear the node. The clientID is never reused, so a late remove is a no-op.
    set(this.myAwarenessRef, null).catch(() => {});
    removeAwarenessStates(this.awareness, [this.awareness.clientID], 'local');
  }
}
