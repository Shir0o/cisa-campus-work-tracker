// Season-settings read/write — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { SeasonSettings } from '@cisa/core';
import { db } from '../firebase';

export function subscribeSeasonSettings(
  cb: (settings: SeasonSettings) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeSeasonSettings(db, cb, onError);
}

export function saveSeasonSettings(patch: Partial<SeasonSettings>): Promise<void> {
  return core.saveSeasonSettings(db, patch);
}
