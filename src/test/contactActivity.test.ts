import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildContactActivityPatch,
  touchContactActivity,
  applyContactActivityToBatch,
  shouldTouchActivityForAttendance,
} from '../lib/contactActivity';

describe('contactActivity (#329)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildContactActivityPatch', () => {
    it('derives identical activity fields for an interaction', () => {
      const stamp = {
        date: '2026-08-19T14:30:00Z',
        by: { uid: 'user-123', name: 'Tony Wang' },
        type: 'interaction' as const,
      };

      const patch = buildContactActivityPatch(stamp);

      expect(patch).toMatchObject({
        lastSeen: '2026-08-19T14:30:00Z',
        lastContactedDate: '2026-08-19T14:30:00Z',
        lastContactedBy: 'Tony Wang',
        lastContactedById: 'user-123',
        hasNewActivity: true,
        updatedBy: 'user-123',
        updatedByName: 'Tony Wang',
      });
      expect(patch.updatedAt).toBeDefined();
    });

    it('derives identical activity fields for a visit', () => {
      const stamp = {
        date: '2026-08-18',
        by: { uid: 'user-456', name: 'Priya Anand' },
        type: 'visit' as const,
      };

      const patch = buildContactActivityPatch(stamp);

      expect(patch).toMatchObject({
        lastSeen: '2026-08-18',
        lastContactedDate: '2026-08-18',
        lastContactedBy: 'Priya Anand',
        lastContactedById: 'user-456',
        hasNewActivity: true,
        updatedBy: 'user-456',
        updatedByName: 'Priya Anand',
      });
      expect(patch.updatedAt).toBeDefined();
    });

    it('derives identical activity fields for an attendance present mark', () => {
      const stamp = {
        date: '2026-08-17',
        by: { uid: 'user-789', name: 'Sam Chen' },
        type: 'attendance' as const,
      };

      const patch = buildContactActivityPatch(stamp);

      expect(patch).toMatchObject({
        lastSeen: '2026-08-17',
        lastContactedDate: '2026-08-17',
        lastContactedBy: 'Sam Chen',
        lastContactedById: 'user-789',
        hasNewActivity: true,
        updatedBy: 'user-789',
        updatedByName: 'Sam Chen',
      });
      expect(patch.updatedAt).toBeDefined();
    });

    it('handles fallback for anonymous or missing user data', () => {
      const patch = buildContactActivityPatch({
        date: '2026-08-19',
        by: {},
      });

      expect(patch).toMatchObject({
        lastSeen: '2026-08-19',
        lastContactedDate: '2026-08-19',
        lastContactedBy: 'Someone',
        lastContactedById: null,
        hasNewActivity: true,
        updatedBy: null,
        updatedByName: 'Someone',
      });
    });
  });

  describe('shouldTouchActivityForAttendance', () => {
    it('returns true for present or late', () => {
      expect(shouldTouchActivityForAttendance(true)).toBe(true);
      expect(shouldTouchActivityForAttendance('late')).toBe(true);
    });

    it('returns false for absent or unmarked/undefined', () => {
      expect(shouldTouchActivityForAttendance('absent')).toBe(false);
      expect(shouldTouchActivityForAttendance(false)).toBe(false);
      expect(shouldTouchActivityForAttendance(undefined)).toBe(false);
    });
  });

  describe('touchContactActivity', () => {
    it('updates the contact document with the derived patch', async () => {
      const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue('contact-ref');
      const fakeDb = {} as any;

      await touchContactActivity(
        fakeDb,
        'contact-1',
        {
          date: '2026-08-19T10:00:00Z',
          by: { uid: 'u1', name: 'Tony' },
        },
        { updateDocFn: mockUpdateDoc, docFn: mockDoc },
      );

      expect(mockDoc).toHaveBeenCalledWith(fakeDb, 'contacts', 'contact-1');
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'contact-ref',
        expect.objectContaining({
          lastSeen: '2026-08-19T10:00:00Z',
          lastContactedDate: '2026-08-19T10:00:00Z',
          lastContactedBy: 'Tony',
          lastContactedById: 'u1',
          hasNewActivity: true,
        }),
      );
    });
  });

  describe('applyContactActivityToBatch', () => {
    it('applies the patch via batch.update', () => {
      const mockBatch = {
        update: vi.fn(),
      } as any;
      const fakeRef = { id: 'contact-1' } as any;

      applyContactActivityToBatch(
        mockBatch,
        fakeRef,
        {
          date: '2026-08-19',
          by: { uid: 'u1', name: 'Tony' },
        },
      );

      expect(mockBatch.update).toHaveBeenCalledWith(
        fakeRef,
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
