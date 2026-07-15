// Gathering events reads — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { Event } from '@cisa/core';
import { db } from '../firebase';

export function subscribeEvents(
  cb: (events: Event[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeEvents(db, cb, onError);
}
