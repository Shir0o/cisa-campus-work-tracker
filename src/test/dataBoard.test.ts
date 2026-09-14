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
  reorderPinnedBoardDocs,
  purgeExpiredTrash,
  enableGuestAccess,
  setGuestPermission,
  regenerateGuestAccess,
  revokeGuestAccess,
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
      { pinned: true, pinnedOrder: null },
    );
  });
});

describe('reorderPinnedBoardDocs', () => {
  it('calls updateDoc with pinnedOrder for each doc', async () => {
    (updateDoc as ReturnType<typeof vi.fn>).mockClear();
    await reorderPinnedBoardDocs([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(updateDoc).toHaveBeenCalledTimes(3);
    expect(updateDoc).toHaveBeenCalledWith({ path: 'board_docs/a' }, { pinnedOrder: 0 });
    expect(updateDoc).toHaveBeenCalledWith({ path: 'board_docs/b' }, { pinnedOrder: 1 });
    expect(updateDoc).toHaveBeenCalledWith({ path: 'board_docs/c' }, { pinnedOrder: 2 });
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


describe('enableGuestAccess', () => {
  it('mints a fresh enabled key at the requested permission', async () => {
    (updateDoc as ReturnType<typeof vi.fn>).mockClear();
    await enableGuestAccess({ id: 'doc-g1' }, 'view', 'u-admin');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [ref, patch] = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ref).toEqual({ path: 'board_docs/doc-g1' });
    expect(patch.updatedBy).toBe('u-admin');
    expect(patch.updatedAt).toBe('mock-server-ts');
    expect(patch.guestAccess.enabled).toBe(true);
    expect(patch.guestAccess.permission).toBe('view');
    expect(patch.guestAccess.createdBy).toBe('u-admin');
    expect(patch.guestAccess.createdAt).toBe('mock-server-ts');
    expect(patch.guestAccess.key).toMatch(/^sec_[A-Za-z0-9_-]{43}$/);
  });
});

describe('setGuestPermission', () => {
  it('updates only the permission so the existing key keeps working', async () => {
    (updateDoc as ReturnType<typeof vi.fn>).mockClear();
    await setGuestPermission({ id: 'doc-g2' }, 'edit', 'u-admin');
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'board_docs/doc-g2' },
      { 'guestAccess.permission': 'edit', updatedAt: 'mock-server-ts', updatedBy: 'u-admin' },
    );
  });
});

describe('regenerateGuestAccess', () => {
  it('replaces the key without touching anything else on the doc', async () => {
    (updateDoc as ReturnType<typeof vi.fn>).mockClear();
    await regenerateGuestAccess({ id: 'doc-g3' }, 'edit', 'u-admin');
    const [, patch] = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch.guestAccess.key).toMatch(/^sec_[A-Za-z0-9_-]{43}$/);
    expect(patch.guestAccess.permission).toBe('edit');
    expect(patch.md).toBeUndefined();
    expect(patch.title).toBeUndefined();
  });

  it('mints a different key on every regeneration', async () => {
    (updateDoc as ReturnType<typeof vi.fn>).mockClear();
    await regenerateGuestAccess({ id: 'doc-g4' }, 'view');
    await regenerateGuestAccess({ id: 'doc-g4' }, 'view');
    const first = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0][1].guestAccess.key;
    const second = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[1][1].guestAccess.key;
    expect(first).not.toBe(second);
  });
});

describe('revokeGuestAccess', () => {
  it('clears the config so no key remains on the doc', async () => {
    (updateDoc as ReturnType<typeof vi.fn>).mockClear();
    await revokeGuestAccess({ id: 'doc-g5' }, 'u-admin');
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'board_docs/doc-g5' },
      { guestAccess: null, updatedAt: 'mock-server-ts', updatedBy: 'u-admin' },
    );
  });
});
