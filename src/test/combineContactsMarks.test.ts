import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestore = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  setDoc: vi.fn(async (_ref: unknown, _data: Record<string, unknown>) => {}),
  deleteDoc: vi.fn(async (_ref: unknown) => {}),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  setDoc: firestore.setDoc,
  deleteDoc: firestore.deleteDoc,
  serverTimestamp: firestore.serverTimestamp,
}));

const handleFirestoreError = vi.hoisted(() => vi.fn());
vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError,
  OperationType: { CREATE: 'CREATE', DELETE: 'DELETE' },
}));

import {
  markNotSamePerson,
  unmarkNotSamePerson,
  NOT_SAME_PERSON_MARKS,
} from '../lib/combineContactsMarks';

beforeEach(() => vi.clearAllMocks());

describe('Not the same person marks (#1432)', () => {
  it('marks an unordered pair under one shared document, with who and when', async () => {
    await markNotSamePerson({ contactA: 'c2', contactB: 'c1', uid: 'admin1', name: 'Faith' });

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = firestore.setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(ref).toEqual({ col: NOT_SAME_PERSON_MARKS, id: 'c1|c2' });
    expect(data).toMatchObject({
      contactIds: ['c1', 'c2'],
      markedBy: 'admin1',
      markedByName: 'Faith',
    });
    expect(data.markedAt).toBe('SERVER_TS');
  });

  it('removes the mark for the same unordered pair', async () => {
    await unmarkNotSamePerson('c2', 'c1');

    expect(firestore.deleteDoc).toHaveBeenCalledWith({ col: NOT_SAME_PERSON_MARKS, id: 'c1|c2' });
  });

  it('reports a failed write and rethrows', async () => {
    firestore.setDoc.mockRejectedValueOnce(new Error('denied'));
    await expect(
      markNotSamePerson({ contactA: 'c1', contactB: 'c2', uid: 'admin1', name: 'Faith' }),
    ).rejects.toThrow('denied');
    expect(handleFirestoreError).toHaveBeenCalled();
  });

  it('reports a failed delete and rethrows', async () => {
    firestore.deleteDoc.mockRejectedValueOnce(new Error('denied'));
    await expect(unmarkNotSamePerson('c1', 'c2')).rejects.toThrow('denied');
    expect(handleFirestoreError).toHaveBeenCalled();
  });
});
