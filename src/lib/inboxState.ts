import { deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { UserEntityState } from "./userEntityState";

// Per-person worklist state, on the server (#813).
//
// Two independent axes, the pair `userEntityState.ts` already models locally:
//   • seen      — passive. You opened the contact, so you know who this is.
//                 Shows as the unread dot. Never set by scrolling past.
//   • completed — deliberate. You are finished with this item. This is the
//                 number in the "N to work through" header.
//
// They are kept apart on purpose: opening something must never make the count
// go down. `AttentionFeed` used to collapse them into one gesture, which is why
// an inbox built on it would have lied.
//
// Stored at `inboxState/{uid}` — one document per person, mirroring the shape
// and the rules of `userPreferences/{uid}`. It lives with the person and not on
// the contact because (a) the question "have *I* looked at this" is per person,
// so one boolean on a shared contact cannot answer it once there are several
// Full-timers, and (b) writing it onto the contact would make every glance a
// write to a document a dozen clients are subscribed to.
//
// `localStorage` (via UserEntityState) stays as the synchronous cache in front
// of it, and as the source for the one-time migration: the first load that
// finds no server document uploads whatever that browser had, so nobody's
// history reappears as new on launch day.

/** Entry maps are id → ISO timestamp, so old ids can be pruned by age. */
export type InboxStamps = Record<string, string>;

export interface InboxStateDoc {
  seen?: InboxStamps;
  completed?: InboxStamps;
  /** Set once the local store has been folded in, so it happens exactly once. */
  migratedAt?: string;
}

/** Ids stop being interesting after a term; drop them rather than grow forever. */
export const PRUNE_AFTER_DAYS = 120;

const DAY_MS = 86_400_000;

const ref = (uid: string) => doc(db, "inboxState", uid);

const now = () => new Date().toISOString();

/** Entries whose stamp is older than `days`, oldest first. */
export function staleIds(
  stamps: InboxStamps | undefined,
  days: number = PRUNE_AFTER_DAYS,
  at: number = Date.now(),
): string[] {
  if (!stamps) return [];
  const cutoff = at - days * DAY_MS;
  return Object.entries(stamps)
    .filter(([, iso]) => {
      const t = new Date(iso).getTime();
      return !Number.isNaN(t) && t < cutoff;
    })
    .map(([id]) => id);
}

/** Drop stale entries from a loaded document (pure — the caller writes). */
export function pruned(stamps: InboxStamps | undefined, at: number = Date.now()): InboxStamps {
  const out: InboxStamps = {};
  const stale = new Set(staleIds(stamps, PRUNE_AFTER_DAYS, at));
  for (const [id, iso] of Object.entries(stamps ?? {})) {
    if (!stale.has(id)) out[id] = iso;
  }
  return out;
}

// ── live view ───────────────────────────────────────────────────────────────
// Module-level so the pure derivations in `attention.ts` can read it
// synchronously, exactly as UserEntityState is read today.

interface Bucket {
  seen: Set<string>;
  completed: Set<string>;
  loaded: boolean;
}

const buckets: Record<string, Bucket> = {};
const subs = new Set<() => void>();

const emit = () => {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });
};

/** The live view for one person, seeded from this browser's local store the
 *  first time anyone asks. The seed matters because every read here is
 *  synchronous — a card rendered before the snapshot arrives must not claim
 *  that someone you cleared last night is new again. */
const bucketOf = (uid: string): Bucket => {
  const existing = buckets[uid];
  if (existing) return existing;
  const local = localRefs(uid);
  return (buckets[uid] = {
    seen: new Set(local.seen),
    completed: new Set(local.completed),
    loaded: false,
  });
};

/** What this browser already knew, in the worklist's two words. */
export function localRefs(uid: string): { seen: string[]; completed: string[] } {
  try {
    const { read, done } = UserEntityState.allRefs(uid);
    return { seen: read, completed: done };
  } catch {
    return { seen: [], completed: [] };
  }
}

/**
 * Subscribe to this user's worklist state. Hydrates the module-level view, folds
 * the browser's local store in on the very first load (once, recorded by
 * `migratedAt`), and prunes ids older than a term.
 */
export function subscribeInboxState(
  uid: string,
  localSeed: { seen: string[]; completed: string[] } = localRefs(uid),
  onError?: (e: unknown) => void,
): () => void {
  bucketOf(uid);
  try {
    return onSnapshot(
      ref(uid),
      (snap) => {
        const data = (snap.data() as InboxStateDoc) ?? {};
        const b = bucketOf(uid);

        // Rebuilt rather than merged: Firestore applies our own pending writes
        // to this snapshot before it arrives, so the document is the truth —
        // and merging would make Undo unable to take anything back.
        const seen = new Set(Object.keys(pruned(data.seen)));
        const completed = new Set(Object.keys(pruned(data.completed)));

        if (!data.migratedAt && (localSeed.seen.length || localSeed.completed.length)) {
          // First load on the server for this person: keep what this browser had.
          void migrateLocal(uid, localSeed, data);
          for (const id of localSeed.seen) seen.add(id);
          for (const id of localSeed.completed) completed.add(id);
        }

        b.seen = seen;
        b.completed = completed;
        b.loaded = true;
        emit();

        void prune(uid, data);
      },
      (e) => (onError ? onError(e) : console.error("inboxState subscription error", e)),
    );
  } catch (e) {
    // No live Firestore (a test render, an offline first paint): the local seed
    // is still in place, so the worklist reads correctly and writes go nowhere
    // rather than throwing under the person using it.
    if (onError) onError(e);
    return () => {};
  }
}

async function migrateLocal(
  uid: string,
  localSeed: { seen: string[]; completed: string[] },
  existing: InboxStateDoc,
): Promise<void> {
  const stamp = now();
  const seen: InboxStamps = { ...(existing.seen ?? {}) };
  const completed: InboxStamps = { ...(existing.completed ?? {}) };
  for (const id of localSeed.seen) seen[id] ??= stamp;
  for (const id of localSeed.completed) completed[id] ??= stamp;
  try {
    await setDoc(ref(uid), { seen, completed, migratedAt: stamp }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `inboxState/${uid}`);
  }
}

async function prune(uid: string, data: InboxStateDoc): Promise<void> {
  const stale = [...staleIds(data.seen), ...staleIds(data.completed)];
  if (stale.length === 0) return;
  const patch: Record<string, Record<string, unknown>> = { seen: {}, completed: {} };
  for (const id of staleIds(data.seen)) patch.seen[id] = deleteField();
  for (const id of staleIds(data.completed)) patch.completed[id] = deleteField();
  try {
    await setDoc(ref(uid), patch, { merge: true });
  } catch {
    /* pruning is housekeeping — never surface it */
  }
}

async function write(
  uid: string,
  axis: "seen" | "completed",
  ids: string[],
  on: boolean,
): Promise<void> {
  if (ids.length === 0) return;
  const stamp = now();
  const patch: InboxStamps | Record<string, unknown> = {};
  for (const id of ids) patch[id] = on ? stamp : deleteField();
  try {
    await setDoc(ref(uid), { [axis]: patch }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `inboxState/${uid}`);
  }
}

function apply(uid: string, axis: "seen" | "completed", ids: string[], on: boolean) {
  const b = bucketOf(uid);
  let changed = false;
  for (const id of ids) {
    if (on ? !b[axis].has(id) : b[axis].has(id)) {
      if (on) b[axis].add(id);
      else b[axis].delete(id);
      changed = true;
    }
  }
  if (changed) {
    // Mirrored into the local store as well: it is the synchronous cache in
    // front of the server, and it is what a browser reads back before the
    // snapshot lands.
    for (const id of ids) {
      if (axis === "seen") UserEntityState.setRead(uid, id, on);
      else UserEntityState.setDone(uid, id, on);
    }
    emit();
    void write(uid, axis, ids, on);
  }
}

export const InboxState = {
  /** You have opened this contact — the unread dot goes away. */
  isSeen: (uid: string, id: string): boolean => bucketOf(uid).seen.has(id),
  /** You are finished with this item — it leaves the "to work through" count. */
  isCompleted: (uid: string, id: string): boolean => bucketOf(uid).completed.has(id),
  /** True once the server document has arrived (before that, local-only). */
  isLoaded: (uid: string): boolean => bucketOf(uid).loaded,

  markSeen: (uid: string, ids: string | string[]) =>
    apply(uid, "seen", Array.isArray(ids) ? ids : [ids], true),
  markCompleted: (uid: string, ids: string | string[]) =>
    apply(uid, "completed", Array.isArray(ids) ? ids : [ids], true),
  /** Undo — the snackbar's only job. */
  undoCompleted: (uid: string, ids: string | string[]) =>
    apply(uid, "completed", Array.isArray(ids) ? ids : [ids], false),

  subscribe(fn: () => void): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/** React hook — re-renders on any change to this person's worklist state. */
export function useInboxState(): typeof InboxState {
  const [, force] = useState(0);
  useEffect(() => InboxState.subscribe(() => force((n) => n + 1)), []);
  return InboxState;
}

/** Test-only reset of the module-level view. */
export function __resetInboxState() {
  for (const k of Object.keys(buckets)) delete buckets[k];
}
