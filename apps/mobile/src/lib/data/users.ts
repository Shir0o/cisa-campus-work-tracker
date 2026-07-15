// Full-timer roster read — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { FullTimerSummary } from '@cisa/core';
import { db } from '../firebase';

export function subscribeFullTimers(
  cb: (fullTimers: FullTimerSummary[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeFullTimers(db, cb, onError);
}
