// Gathering type ("kind") reads — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { GatheringType } from '@cisa/core';
import { db } from '../firebase';

export function subscribeGatheringTypes(
  cb: (types: GatheringType[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeGatheringTypes(db, cb, onError);
}
