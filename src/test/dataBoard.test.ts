import { describe, it, expect, vi } from 'vitest';
import { Timestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { remove as dbRemove } from 'firebase/database';

// isExpiredTrash is pure and never touches db/rtdb, but importing the module
// pulls in ../lib/firebase, which eagerly initializes a real Firebase app at
// import time — mock it so this test doesn't need a valid API key/project.
vi.mock('../lib/firebase', () => ({ db: {}, rtdb: {} }));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn((_db: any, _col: string, id: string) => ({ path: `${_col}/${id}` })),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    serverTimestamp: vi.fn(() => 'mock-server-ts'),
  };
});

vi.mock('firebase/database', () => ({
  ref: vi.fn((_rtdb: any, path: string) => ({ path })),
  remove: vi.fn().mockResolvedValue(undefined),
}));

import {
  isExpiredTrash,
  softDeleteBoardDoc,
  restoreBoardDoc,
  deleteBoardDoc,
  pinBoardDoc,
  purgeExpiredTrash,
} from '../lib/data/board';

describe('isExpiredTrash', () => {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = new Date('2026-07-01T00:00:00Z').getTime();

  it('is false for a doc with no deletedAt', () => {
    expect(isExpiredTrash(undefined, now)).toBe(false);
    expect(isExpiredTrash(null, now)).toBe(false);
  });

  it('is false just under 30 days, true once 30 days have elapsed', () => {
    const justUnder = Timestamp.fromMillis(now - THIRTY_DAYS_MS + 1000);
    const exactly30 = Timestamp.fromMillis(now - THIRTY_DAYS_MS);
    expect(isExpiredTrash(justUnder, now)).toBe(false);
    expect(isExpiredTrash(exactly30, now)).toBe(true);
  });

  it('is true well past 30 days', () => {
    const wayOld = Timestamp.fromMillis(now - THIRTY_DAYS_MS * 3);
    expect(isExpiredTrash(wayOld, now)).toBe(true);
  });
});

describe('softDeleteBoardDoc', () => {
  it('calls updateDoc with deletedAt and removes RTDB node', async () => {
    await softDeleteBoardDoc({ id: 'doc-1' });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'board_docs/doc-1' },
      { deletedAt: 'mock-server-ts' },
    );
    expect(dbRemove).toHaveBeenCalledWith({ path: 'board_docs_rtdb/doc-1' });
  });
});

describe('restoreBoardDoc', () => {
  it('calls updateDoc to null out deletedAt', async () => {
    await restoreBoardDoc({ id: 'doc-2' });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'board_docs/doc-2' },
      { deletedAt: null },
    );
  });
});

describe('deleteBoardDoc', () => {
  it('calls deleteDoc and removes RTDB node', async () => {
    await deleteBoardDoc({ id: 'doc-3' });
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'board_docs/doc-3' });
    expect(dbRemove).toHaveBeenCalledWith({ path: 'board_docs_rtdb/doc-3' });
  });
});

describe('pinBoardDoc', () => {
  it('calls updateDoc with pinned: true', async () => {
    await pinBoardDoc({ id: 'doc-4' }, true);
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'board_docs/doc-4' },
      { pinned: true },
    );
  });
});

describe('purgeExpiredTrash', () => {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  it('deletes only expired docs', async () => {
    const now = Date.now();
    const expiredDoc = { id: 'exp-1', deletedAt: Timestamp.fromMillis(now - THIRTY_DAYS_MS - 1000) } as any;
    const recentDoc = { id: 'rec-1', deletedAt: Timestamp.fromMillis(now - 1000) } as any;
    await purgeExpiredTrash([expiredDoc, recentDoc]);
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'board_docs/exp-1' });
  });
});

