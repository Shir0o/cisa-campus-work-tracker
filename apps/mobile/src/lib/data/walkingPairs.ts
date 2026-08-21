// Walking-together pairs — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { WalkingPairsMap } from '@cisa/core';
import { db } from '../firebase';

export function subscribeWalkingPairs(
  cb: (pairs: WalkingPairsMap) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeWalkingPairs(db, cb, onError);
}

export function saveWalkingPairs(pairs: WalkingPairsMap): Promise<void> {
  return core.saveWalkingPairs(db, pairs);
}
