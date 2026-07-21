// The Board (board_docs) — Firestore reads/writes behind an injected `db`.
// Mirrors the web app's src/views/CoordinationNotes.tsx listener/delete logic.
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { ref as dbRef, remove as dbRemove, type Database } from "firebase/database";
import { boardAudiencesForRole, docByDateDesc, isTrashedBoardDoc, type BoardDoc } from "../board";
import type { AppRole } from "../permissions";

function mapDoc(d: { id: string; data: () => Record<string, any> }): BoardDoc {
  const data = d.data();
  return { id: d.id, md: "", title: "Untitled page", ...data } as BoardDoc;
}

/** Live subscription to the Pages list — every doc for an admin (server-sorted,
 * matches the `board_docs` rules' admin read bypass), else only docs whose
 * audience the role can see. Always newest-first, sorted client-side so both
 * branches agree (the web-mobile view historically skipped this for the
 * non-admin branch). A role with no visible audience tier at all (e.g.
 * 'viewer' — boardAudiencesForRole's default case) never has board access
 * (see canViewBoard), so this skips querying rather than sending an empty
 * `where('audience','in',[])`, which Firestore rejects client-side, or an
 * unconstrained query, which the rules would reject as permission-denied. */
export function subscribeBoardDocs(
  db: Firestore,
  role: AppRole | string | null,
  cb: (docs: BoardDoc[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  if (role === "admin") {
    return onSnapshot(
      query(collection(db, "board_docs"), orderBy("date", "desc")),
      (snap) => cb(snap.docs.map(mapDoc).filter((d) => !isTrashedBoardDoc(d)).sort(docByDateDesc)),
      (e) => (onError ? onError(e) : console.error("board docs subscription error", e)),
    );
  }
  const audiences = boardAudiencesForRole(role);
  if (audiences.length === 0) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "board_docs"), where("audience", "in", audiences)),
    (snap) => cb(snap.docs.map(mapDoc).filter((d) => !isTrashedBoardDoc(d)).sort(docByDateDesc)),
    (e) => (onError ? onError(e) : console.error("board docs subscription error", e)),
  );
}

/** Live subscription to soft-deleted pages (Trash) — admin-only, mirroring
 * the main list's admin branch (an unconstrained read `board_docs` rules
 * only grant to `isAdmin()`), inverted to show only trashed docs. */
export function subscribeTrashedBoardDocs(
  db: Firestore,
  cb: (docs: BoardDoc[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "board_docs"), orderBy("date", "desc")),
    (snap) => cb(snap.docs.map(mapDoc).filter(isTrashedBoardDoc).sort(docByDateDesc)),
    (e) => (onError ? onError(e) : console.error("trashed board docs subscription error", e)),
  );
}

/** Live subscription to a single page — powers the detail screen. */
export function subscribeBoardDoc(
  db: Firestore,
  docId: string,
  cb: (doc: BoardDoc | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "board_docs", docId),
    (snap) => cb(snap.exists() ? mapDoc(snap) : null),
    (e) => (onError ? onError(e) : console.error("board doc subscription error", e)),
  );
}

/** Soft-deletes a page (moves it to Trash) and best-effort cleans up its
 * live-collab RTDB node so it doesn't orphan. Confirmation is the caller's
 * concern. Recoverable via `restoreBoardDoc`. */
export async function softDeleteBoardDoc(db: Firestore, rtdb: Database | null, boardDoc: Pick<BoardDoc, "id">): Promise<void> {
  await updateDoc(doc(db, "board_docs", boardDoc.id), { deletedAt: serverTimestamp() });
  if (rtdb) {
    try {
      await dbRemove(dbRef(rtdb, `board_docs_rtdb/${boardDoc.id}`));
    } catch {
      // best-effort — the Firestore update already succeeded
    }
  }
}

/** Restores a page out of Trash. */
export async function restoreBoardDoc(db: Firestore, boardDoc: Pick<BoardDoc, "id">): Promise<void> {
  await updateDoc(doc(db, "board_docs", boardDoc.id), { deletedAt: null });
}

/** Permanently deletes a page — only meant to be called from Trash, on an
 * already soft-deleted doc ("Delete Forever"). */
export async function deleteBoardDoc(db: Firestore, rtdb: Database | null, boardDoc: Pick<BoardDoc, "id">): Promise<void> {
  await deleteDoc(doc(db, "board_docs", boardDoc.id));
  if (rtdb) {
    try {
      await dbRemove(dbRef(rtdb, `board_docs_rtdb/${boardDoc.id}`));
    } catch {
      // best-effort — the Firestore delete already succeeded
    }
  }
}
