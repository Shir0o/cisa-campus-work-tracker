// The Bible study reads the phone needs, with `db` bound — the app's data-layer
// idiom (see todos.ts, threads.ts). Components import from here rather than
// from `../firebase` directly, which keeps Firebase auth out of every test that
// renders a shell containing "This week's study" (#946).
import { subscribeEntryPoints as coreSubscribeEntryPoints, type EntryPoint } from '@cisa/core';
import { db } from '../firebase';

export type { EntryPoint };

/** Every standing invitation. A split week is two of them (ADR 0011 §4). */
export function subscribeEntryPoints(cb: (entryPoints: EntryPoint[]) => void): () => void {
  return coreSubscribeEntryPoints(db, cb);
}
