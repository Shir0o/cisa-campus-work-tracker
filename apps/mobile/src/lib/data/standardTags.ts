// Standard tags (#1437, ADR 0039) reads — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`), mirroring data/goal.ts. Mobile
// only reads the list for its suggestion chips; editing stays on the web's
// Full-timer page.
import * as core from '@cisa/core';
import { db } from '../firebase';

/** Live subscription to the team-wide standard tags (settings/standard_tags). */
export function subscribeStandardTags(
  cb: (tags: string[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeStandardTags(db, cb, onError);
}
