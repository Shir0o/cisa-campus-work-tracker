// The Bible study reads the phone needs, with `db` bound — the app's data-layer
// idiom (see todos.ts, threads.ts). Components import from here rather than
// from `../firebase` directly, which keeps Firebase auth out of every test that
// renders a shell containing "This week's study" (#946).
import {
  subscribeEntryPoints as coreSubscribeEntryPoints,
  subscribePublishedStudyMeetings as coreSubscribePublishedStudyMeetings,
  type EntryPoint,
  type Meeting,
} from '@cisa/core';
import { db } from '../firebase';

export type { EntryPoint, Meeting };

/** Every standing invitation. A split week is two of them (ADR 0011 §4). */
export function subscribeEntryPoints(cb: (entryPoints: EntryPoint[]) => void): () => void {
  return coreSubscribeEntryPoints(db, cb);
}

/**
 * The published weeks of a study, newest first — what `/s/:slug` resolves to.
 * "This week's study" reads it so Copy can hand out a permanent link pinned to
 * the week (ADR 0011 §6) rather than the always-latest code.
 */
export function subscribePublishedStudyMeetings(
  studyId: string,
  cb: (meetings: Meeting[]) => void,
): () => void {
  return coreSubscribePublishedStudyMeetings(db, studyId, cb);
}
