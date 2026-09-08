// Meeting collaboration (Tier 1 of ADR 0012) — a Yjs doc replicated over the
// meetings realtime path, consumed by the Meeting editor.
//
// The Board's DocEditor proved the shape (CoordinationNotes): a Y.Doc +
// Awareness per editor mount, an RtdbYjsProvider fanning updates over RTDB,
// and a one-time seed from the durable copy behind the provider's claimSeed
// guard. Here the durable copy is the Firestore Meeting document's `md`, and
// the replicated text is a single Y.Text named "md" — the editor's textarea
// binds to it (ADR 0012 §3: the textarea stays; collab is a hand-rolled
// Y.Text↔textarea binding), while title/date/publish stay single-user fields.
//
// Presence is name chips only (§7): our own `user` state goes into awareness;
// peers are derived with the same peersFromAwareness helper The Board uses.

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { Database } from 'firebase/database';
import { RtdbYjsProvider } from './yjsRtdbProvider';
import { colorFor } from './presence';

export const MEETING_RTDB_BASE = 'bible_study_meetings_rtdb';

export interface CollabStatus {
  live: boolean;
  degraded: boolean;
}

export interface MeetingCollabOptions {
  meetingId: string;
  /** Null means the realtime backend is not configured for this project. */
  rtdb: Database | null;
  me: { uid: string; name: string };
  /** The Meeting's stored markdown — the first collaborative open seeds from it. */
  storedMd: string;
  onStatus?: (status: CollabStatus) => void;
}

export class MeetingCollab {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly text: Y.Text;
  /** Resolves once the provider has synced (or degraded) and seeding settled. */
  readonly ready: Promise<void>;

  private provider: RtdbYjsProvider | null;
  private destroyed = false;
  // The onSynced callback is async (the claimSeed transaction); `ready`
  // resolves only after its seeding branch has settled.
  private settleReady: (() => void) | null = null;

  constructor(doc: Y.Doc, opts: MeetingCollabOptions) {
    this.doc = doc;
    this.text = doc.getText('md');
    this.awareness = new Awareness(doc);
    this.awareness.setLocalStateField('user', {
      uid: opts.me.uid,
      name: opts.me.name,
      color: colorFor(opts.me.uid),
    });

    if (!opts.rtdb) {
      // No realtime backend configured: single-user, the stored copy as-is.
      this.text.insert(0, opts.storedMd);
      this.provider = null;
      this.ready = Promise.resolve();
      opts.onStatus?.({ live: false, degraded: false });
      return;
    }
    // `Promise.withResolvers` is unavailable in this Node baseline; a local
    // deferred keeps the same linear settle-at-the-end shape.
    let settle!: () => void;
    const ready = new Promise<void>((r) => (settle = r));
    this.ready = ready;
    this.settleReady = settle;

    this.provider = new RtdbYjsProvider(opts.rtdb, opts.meetingId, doc, {
      awareness: this.awareness,
      basePath: MEETING_RTDB_BASE,
      onSynced: async (degraded) => {
        if (this.destroyed) return;
        if (degraded) {
          // RTDB unreachable (e.g. permission denied / offline): the editor
          // falls back to single-user autosave over the stored copy (ADR
          // 0012 §4) instead of leaving the pane blank.
          this.text.insert(0, opts.storedMd);
          opts.onStatus?.({ live: false, degraded: true });
        } else {
          opts.onStatus?.({ live: true, degraded: false });
          // First collaborative open seeds from the stored Meeting exactly
          // once; the claimSeed transaction means two simultaneous openers
          // never double-seed, and the loser never overwrites live content.
          const mine = await this.provider!.claimSeed();
          if (mine && !this.destroyed && this.text.length === 0) {
            this.text.insert(0, opts.storedMd);
          }
        }
        this.settleReady?.();
      },
    });
  }

  /**
   * Applies a textarea edit to the Y.Text: replace [start, end) with `value`.
   * Computing the minimal delta keeps the remote caret stable while a peer
   * types elsewhere in the document.
   */
  applyLocalEdit(start: number, end: number, value: string): void {
    const prefix = Math.min(start, end, this.text.length);
    const removed = Math.max(0, end - start);
    if (removed > 0) this.text.delete(prefix, removed);
    if (value) this.text.insert(prefix, value);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.provider?.destroy();
    this.awareness.destroy();
  }
}