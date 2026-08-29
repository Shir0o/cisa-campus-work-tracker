// Session-scoped pending-removal registry for interactions (#650).
//
// Deleting a conversation is a two-beat gesture: the card leaves the screen
// the moment the user taps Remove, but the Firestore deleteDoc (and its audit
// entry) only commit after a short Undo window. The pending commit lives here
// at module scope, so navigating away from the person screen does not cancel
// it — only an explicit Undo does. An app kill inside the window leaves the
// interaction intact, which is the safe failure.
//
// Web and mobile each keep a copy of this module (the platform layers don't
// share runtime state); keep the API identical.
export const INTERACTION_REMOVAL_WINDOW_MS = 5000;

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

/** Re-render hook for surfaces rendering the interactions list. */
export function subscribeInteractionRemovals(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getPendingRemovalIds(): string[] {
  return [...pending.keys()];
}

/** Hide the interaction now; run `commit` after the Undo window unless undone. */
export function scheduleInteractionRemoval(
  interactionId: string,
  commit: () => void,
  windowMs: number = INTERACTION_REMOVAL_WINDOW_MS,
): void {
  cancelInteractionRemoval(interactionId);
  const timer = setTimeout(() => {
    pending.delete(interactionId);
    notify();
    commit();
  }, windowMs);
  pending.set(interactionId, { commit, timer });
  notify();
}

/** Cancel a pending removal — the interaction stays in the record. */
export function cancelInteractionRemoval(interactionId: string): void {
  const entry = pending.get(interactionId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(interactionId);
  notify();
}
