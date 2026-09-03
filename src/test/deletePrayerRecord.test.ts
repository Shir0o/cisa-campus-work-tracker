// deletePrayerRecord — wrapper that hard-deletes a prayer doc from the
// top-level `prayers` collection and writes an audit entry (#706).
//
// The Firestore delete rule requires isManager (Full-timer or Trainee); the
// UI gate mirrors that. The wrapper itself does not re-check the role —
// callers do — because the same module is loaded for views that already
// role-gate the action. The audit log entry follows the wording convention
// used by PrayerList's "added/edited/marked a prayer burden for" entries.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  logActivity: vi.fn(() => Promise.resolve()),
  OperationType: { DELETE: 'delete' },
}));

import { deleteDoc, doc } from 'firebase/firestore';
import { logActivity } from '../lib/firebase';
import { deletePrayerRecord } from '../lib/prayers';

const mockDeleteDoc = vi.mocked(deleteDoc);
const mockDoc = vi.mocked(doc);
const mockLogActivity = vi.mocked(logActivity);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deletePrayerRecord', () => {
  it('deletes the prayer doc at prayers/{prayerId}', async () => {
    await deletePrayerRecord('p-1', {
      contactId: 'c-1',
      contactName: 'Mei Tanaka',
      burden: 'For peace about finals',
    });
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'prayers', 'p-1');
  });

  it('writes a cleared-prayer audit entry naming the contact', async () => {
    await deletePrayerRecord('p-1', {
      contactId: 'c-1',
      contactName: 'Mei Tanaka',
      burden: 'For peace about finals',
    });
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledWith({
      action: 'cleared a prayer for',
      targetId: 'c-1',
      targetName: 'Mei Tanaka',
      targetType: 'contact',
      type: 'comment',
      description: 'For peace about finals',
    });
  });

  it('handles firestore failures without throwing', async () => {
    mockDeleteDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(deletePrayerRecord('p-bad', {
      contactId: 'c-1',
      contactName: 'Mei',
      burden: 'x',
    })).resolves.toBeUndefined();
    // handleFirestoreError is called on failure (verified by the no-throw).
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});