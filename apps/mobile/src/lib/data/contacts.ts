// Contacts/stages/touches reads — thin mobile wrapper around the shared
// @cisa/core logic (behind an injected `db`).
import * as core from '@cisa/core';
import type { Contact, Stage, Touch } from '@cisa/core';
import { db } from '../firebase';

export function subscribeContacts(
  cb: (contacts: Contact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeContacts(db, cb, onError);
}

export function subscribeStages(
  cb: (stages: Stage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeStages(db, cb, onError);
}

export function subscribeTouches(
  cb: (touches: Touch[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeTouches(db, cb, onError);
}
