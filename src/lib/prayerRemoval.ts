// Session-scoped pending-removal registry for prayers (#706).
//
// Clearing a prayer is a two-beat gesture: the row leaves the UI the moment
// the user taps Clear, but the Firestore deleteDoc (and its audit entry)
// only commit after a short Undo window. The pending commit lives here at
// module scope, so closing the page or navigating away does not cancel it —
// only an explicit Undo does. An app kill inside the window leaves the
// prayer intact, which is the safe failure.
//
// Web and mobile each keep a copy of this module (the platform layers don't
// share runtime state); keep the API identical.
export const PRAYER_REMOVAL_WINDOW_MS = 5000;

type TimerHandle = ReturnType<typeof setTimeout>;

interface PendingRemoval {
  commit: () => void;
  timer: TimerHandle;
}

const pending = new Map<string, PendingRemoval>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** Re-render hook for surfaces rendering the prayers list. */
export function subscribePrayerRemovals(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getPendingPrayerRemovalIds(): string[] {
  return [...pending.keys()];
}

/** Hide the prayer now; run `commit` after the Undo window unless undone. */
export function schedulePrayerRemoval(
  prayerId: string,
  commit: () => void,
  windowMs: number = PRAYER_REMOVAL_WINDOW_MS,
): void {
  cancelPrayerRemoval(prayerId);
  const timer = setTimeout(() => {
    pending.delete(prayerId);
    notify();
    commit();
  }, windowMs);
  pending.set(prayerId, { commit, timer });
  notify();
}

/** Cancel a pending removal — the prayer stays in the record. */
export function cancelPrayerRemoval(prayerId: string): void {
  const entry = pending.get(prayerId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(prayerId);
  notify();
}