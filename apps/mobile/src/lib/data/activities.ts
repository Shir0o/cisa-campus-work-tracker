// System activity feed reads — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { Hist } from '@cisa/core';
import { db } from '../firebase';

/** Live subscription to the most recent 100 logged activities, newest first. */
export function subscribeActivities(
  cb: (activities: Hist[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeActivities(db, cb, onError);
}
