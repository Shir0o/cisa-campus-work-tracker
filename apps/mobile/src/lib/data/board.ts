// The Board (board_docs) — thin mobile wrapper around the shared @cisa/core
// logic (behind an injected `db`/`rtdb`).
import * as core from '@cisa/core';
import type { AppRole, BoardDoc } from '@cisa/core';
import { db, rtdb, handleFirestoreError, OperationType } from '../firebase';

export function subscribeBoardDocs(
  role: AppRole | string | null,
  cb: (docs: BoardDoc[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeBoardDocs(db, role, cb, onError);
}

export function subscribeBoardDoc(
  docId: string,
  cb: (doc: BoardDoc | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeBoardDoc(db, docId, cb, onError);
}

export function subscribeTrashedBoardDocs(
  cb: (docs: BoardDoc[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeTrashedBoardDocs(db, cb, onError);
}

export async function softDeleteBoardDoc(boardDoc: Pick<BoardDoc, 'id'>): Promise<void> {
  try {
    await core.softDeleteBoardDoc(db, rtdb, boardDoc);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `board_docs/${boardDoc.id}`);
  }
}

export async function restoreBoardDoc(boardDoc: Pick<BoardDoc, 'id'>): Promise<void> {
  try {
    await core.restoreBoardDoc(db, boardDoc);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `board_docs/${boardDoc.id}`);
  }
}

export async function deleteBoardDoc(boardDoc: Pick<BoardDoc, 'id'>): Promise<void> {
  try {
    await core.deleteBoardDoc(db, rtdb, boardDoc);
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `board_docs/${boardDoc.id}`);
  }
}
