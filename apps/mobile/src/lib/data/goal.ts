// THE DAY'S GOAL (#544) reads/writes — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`), mirroring data/asks.ts.
import * as core from '@cisa/core';
import { db, handleFirestoreError, OperationType } from '../firebase';

export type { DayGoal } from '@cisa/core';

/** Live subscription to the team-wide day goal (settings/goal). */
export function subscribeDayGoal(
  cb: (goal: core.DayGoal) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeDayGoal(db, cb, onError);
}

/** Merge-write the day goal (create-or-update). Rules gate it to full-timers. */
export async function saveDayGoal(patch: Partial<core.DayGoal>): Promise<void> {
  try {
    await core.saveDayGoal(db, patch);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'settings/goal');
  }
}