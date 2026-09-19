import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { deleteThreadMessage } from '../src/data/threads';

const DOC_REF = { __docRef: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteThreadMessage', () => {
  it('calls deleteDoc on the specific thread message document', async () => {
    const mockDb = {};
    firestoreMock.doc.mockReturnValue(DOC_REF);
    firestoreMock.deleteDoc.mockResolvedValue(undefined);

    await deleteThreadMessage(mockDb as never, 'c1', 'm1');

    expect(firestoreMock.doc).toHaveBeenCalledWith(mockDb, 'contacts', 'c1', 'threads', 'm1');
    expect(firestoreMock.deleteDoc).toHaveBeenCalledWith(DOC_REF);
  });
});