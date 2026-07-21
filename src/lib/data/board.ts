// The Board (board_docs) — soft-delete/restore/pin/purge helpers shared by
// CoordinationNotes.tsx, EmbedCoordinationDoc.tsx, and CoordinationTrash.tsx.
// The web app has no dependency on @cisa/core (mobile-only package), so this
// mirrors packages/core/src/data/board.ts's shape for the web side.
import { doc, deleteDoc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { ref as dbRef, remove as dbRemove } from 'firebase/database';
import { db, rtdb } from '../firebase';
import type { BoardDoc } from '../board';

/** Soft-deletes a page (moves it to Trash) and best-effort cleans up its
 * live-collab RTDB node so it doesn't orphan. Recoverable via `restoreBoardDoc`. */
export async function softDeleteBoardDoc(boardDoc: Pick<BoardDoc, 'id'>): Promise<void> {
  await updateDoc(doc(db, 'board_docs', boardDoc.id), { deletedAt: serverTimestamp() });
  if (rtdb) {
    try {
      await dbRemove(dbRef(rtdb, `board_docs_rtdb/${boardDoc.id}`));
    } catch {
      // best-effort — the Firestore update already succeeded
    }
  }
}

/** Restores a page out of Trash. */
export async function restoreBoardDoc(boardDoc: Pick<BoardDoc, 'id'>): Promise<void> {
  await updateDoc(doc(db, 'board_docs', boardDoc.id), { deletedAt: null });
}

/** Permanently deletes a page — only meant to be called from Trash, on an
 * already soft-deleted doc ("Delete Forever"). */
export async function deleteBoardDoc(boardDoc: Pick<BoardDoc, 'id'>): Promise<void> {
  await deleteDoc(doc(db, 'board_docs', boardDoc.id));
  if (rtdb) {
    try {
      await dbRemove(dbRef(rtdb, `board_docs_rtdb/${boardDoc.id}`));
    } catch {
      // best-effort — the Firestore delete already succeeded
    }
  }
}

/** Pins/unpins a page so it sorts first in the Pages list. */
export async function pinBoardDoc(boardDoc: Pick<BoardDoc, 'id'>, pinned: boolean): Promise<void> {
  await updateDoc(doc(db, 'board_docs', boardDoc.id), { pinned });
}

const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** True once a trashed doc has sat in Trash for 30+ days and is due for
 * permanent purge. Pure so it's testable without a Firestore mock. */
export function isExpiredTrash(deletedAt: unknown, now: number = Date.now()): boolean {
  const ms = deletedAt instanceof Timestamp ? deletedAt.toDate().getTime() : null;
  return ms !== null && now - ms >= TRASH_TTL_MS;
}

/** Lazy sweep: permanently deletes any Trash doc older than 30 days. Called
 * whenever the Trash view loads — there's no scheduled server-side job, so a
 * page only actually vanishes once someone next opens Trash. Best-effort and
 * fire-and-forget from the caller's perspective. */
export async function purgeExpiredTrash(docs: BoardDoc[]): Promise<void> {
  const expired = docs.filter((d) => isExpiredTrash(d.deletedAt));
  await Promise.allSettled(expired.map((d) => deleteBoardDoc(d)));
}
