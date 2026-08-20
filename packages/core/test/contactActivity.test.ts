import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildContactActivityPatch,
  shouldTouchActivityForAttendance,
  touchContactActivity,
} from '../src/data/contactActivity';

describe('packages/core contactActivity (#329)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildContactActivityPatch', () => {
    it('derives consistent activity fields', () => {
      const patch = buildContactActivityPatch({
        date: '2026-08-19',
        by: { uid: 'u1', name: 'Tony' },
        type: 'interaction',
      });

      expect(patch).toMatchObject({
        lastSeen: '2026-08-19',
        lastContactedDate: '2026-08-19',
        lastContactedBy: 'Tony',
        lastContactedById: 'u1',
        hasNewActivity: true,
        updatedBy: 'u1',
        updatedByName: 'Tony',
      });
      expect(patch.updatedAt).toBeDefined();
    });
  });

  describe('shouldTouchActivityForAttendance', () => {
    it('returns true only for present and late', () => {
      expect(shouldTouchActivityForAttendance(true)).toBe(true);
      expect(shouldTouchActivityForAttendance('late')).toBe(true);
      expect(shouldTouchActivityForAttendance('absent')).toBe(false);
      expect(shouldTouchActivityForAttendance(false)).toBe(false);
      expect(shouldTouchActivityForAttendance(undefined)).toBe(false);
    });
  });

  describe('touchContactActivity', () => {
    it('updates contact doc via updateDoc', async () => {
      const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue('doc-ref');

      const fakeDb = {} as any;
      await touchContactActivity(
        fakeDb,
        'c1',
        {
          date: '2026-08-19',
          by: { uid: 'u1', name: 'Tony' },
        },
        { updateDocFn: mockUpdateDoc, docFn: mockDoc },
      );

      expect(mockDoc).toHaveBeenCalledWith(fakeDb, 'contacts', 'c1');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({
          lastSeen: '2026-08-19',
          lastContactedDate: '2026-08-19',
          lastContactedBy: 'Tony',
          lastContactedById: 'u1',
          hasNewActivity: true,
        }),
      );
    });
  });
});
