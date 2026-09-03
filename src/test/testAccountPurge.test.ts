import { describe, it, expect, vi } from 'vitest';
import {
  isTestAccount,
  scanTestAccountTraces,
  purgeTestAccountTraces,
  type PurgePlan,
} from '../lib/testAccountPurge';
import type { Firestore } from 'firebase/firestore';

describe('testAccountPurge', () => {
  describe('isTestAccount', () => {
    it('identifies reviewer accounts by email or name', () => {
      expect(isTestAccount({ email: 'reviewer@gmail.com' })).toBe(true);
      expect(isTestAccount({ email: 'reviewer123@gmail.com' })).toBe(true);
      expect(isTestAccount({ email: 'reviewer-appstore@campus.edu' })).toBe(true);
      expect(isTestAccount({ displayName: 'App Store Reviewer' })).toBe(true);
      expect(isTestAccount({ displayName: 'reviewer' })).toBe(true);
    });

    it('identifies cisa service/test accounts by email or name', () => {
      expect(isTestAccount({ email: 'cisa-admin@test.com' })).toBe(true);
      expect(isTestAccount({ email: 'cisa-trainee@gmail.com' })).toBe(true);
      expect(isTestAccount({ displayName: 'cisa-test' })).toBe(true);
    });

    it('returns false for real campus users and team members', () => {
      expect(isTestAccount({ email: 'sarah.lee@campus.edu', displayName: 'Sarah Lee' })).toBe(false);
      expect(isTestAccount({ email: 'yilongwang05@gmail.com', displayName: 'Tony Wang' })).toBe(false);
      expect(isTestAccount({ email: 'john@example.com', displayName: 'John Doe' })).toBe(false);
    });
  });

  describe('scanTestAccountTraces', () => {
    it('scans and builds a PurgePlan targeting test users, invites, prayers, interactions, and contacts', async () => {
      const mockUsers = [
        { id: 'u-real', data: () => ({ email: 'real@campus.edu', displayName: 'Real Person' }) },
        { id: 'u-reviewer', data: () => ({ email: 'reviewer-1@gmail.com', displayName: 'Reviewer One' }) },
        { id: 'u-cisa', data: () => ({ email: 'cisa-qa@gmail.com', displayName: 'Cisa QA' }) },
      ];

      const mockInvitations = [
        { id: 'real-inv@campus.edu', data: () => ({ email: 'real-inv@campus.edu' }) },
        { id: 'reviewer-inv@gmail.com', data: () => ({ email: 'reviewer-inv@gmail.com' }) },
      ];

      const mockContacts = [
        { id: 'c-real', data: () => ({ name: 'Real Contact', createdBy: 'u-real' }) },
        { id: 'c-test', data: () => ({ name: 'Test Contact', createdBy: 'u-reviewer' }) },
      ];

      const mockPrayers = [
        { id: 'p1', data: () => ({ title: 'Reviewer Prayer' }) },
      ];

      const mockInteractions = [
        { id: 'i-real', data: () => ({ userId: 'u-real', content: 'Real interaction' }) },
        { id: 'i-test', data: () => ({ userId: 'u-reviewer', content: 'Test interaction' }) },
      ];

      // Mock Firestore reader functions
      const mockGetDocs = vi.fn((q: any) => {
        const path = q?.path || q?._path || '';
        if (path === 'users') return Promise.resolve({ docs: mockUsers });
        if (path === 'invitations') return Promise.resolve({ docs: mockInvitations });
        if (path === 'contacts') return Promise.resolve({ docs: mockContacts });
        if (path === 'users/u-reviewer/personalPrayers') return Promise.resolve({ docs: mockPrayers });
        if (path === 'contacts/c-test/interactions') return Promise.resolve({ docs: mockInteractions });
        return Promise.resolve({ docs: [] });
      });

      const mockCollection = vi.fn((_db: any, path: string) => ({ path }));

      const plan = await scanTestAccountTraces({} as Firestore, {
        getDocs: mockGetDocs as any,
        collection: mockCollection as any,
      });

      expect(plan.testUsers).toHaveLength(2);
      expect(plan.testUsers.map((u) => u.id)).toEqual(['u-reviewer', 'u-cisa']);
      expect(plan.invitations).toHaveLength(1);
      expect(plan.invitations[0].id).toBe('reviewer-inv@gmail.com');
      expect(plan.interactions).toHaveLength(1);
      expect(plan.interactions[0].id).toBe('i-test');
      expect(plan.contactsCreatedByTestAccounts).toHaveLength(1);
      expect(plan.contactsCreatedByTestAccounts[0].id).toBe('c-test');
      expect(plan.totalDeletionsCount).toBe(6); // 2 users + 1 invite + 1 prayer + 1 interaction + 1 test contact
    });
  });

  describe('purgeTestAccountTraces', () => {
    it('executes batch deletions for all targeted documents in the plan', async () => {
      const plan: PurgePlan = {
        testUsers: [{ id: 'u-test', path: 'users/u-test' }],
        invitations: [{ id: 'inv-test', path: 'invitations/inv-test' }],
        personalPrayers: [{ id: 'p1', path: 'users/u-test/personalPrayers/p1' }],
        interactions: [{ id: 'i-test', path: 'contacts/c1/interactions/i-test' }],
        contactsCreatedByTestAccounts: [{ id: 'c-test', path: 'contacts/c-test' }],
        totalDeletionsCount: 5,
      };

      const deletedPaths: string[] = [];
      const mockDeleteDoc = vi.fn((ref: any) => {
        deletedPaths.push(ref.path);
        return Promise.resolve();
      });

      const mockDoc = vi.fn((_db: any, path: string) => ({ path }));

      const result = await purgeTestAccountTraces({} as Firestore, plan, {
        deleteTestContacts: true,
        deleteDoc: mockDeleteDoc as any,
        doc: mockDoc as any,
      });

      expect(result.deletedCount).toBe(5);
      expect(deletedPaths).toContain('users/u-test');
      expect(deletedPaths).toContain('invitations/inv-test');
      expect(deletedPaths).toContain('users/u-test/personalPrayers/p1');
      expect(deletedPaths).toContain('contacts/c1/interactions/i-test');
      expect(deletedPaths).toContain('contacts/c-test');
    });

    it('skips deleting test contacts if deleteTestContacts is false', async () => {
      const plan: PurgePlan = {
        testUsers: [{ id: 'u-test', path: 'users/u-test' }],
        invitations: [],
        personalPrayers: [],
        interactions: [],
        contactsCreatedByTestAccounts: [{ id: 'c-test', path: 'contacts/c-test' }],
        totalDeletionsCount: 2,
      };

      const deletedPaths: string[] = [];
      const mockDeleteDoc = vi.fn((ref: any) => {
        deletedPaths.push(ref.path);
        return Promise.resolve();
      });
      const mockDoc = vi.fn((_db: any, path: string) => ({ path }));

      const result = await purgeTestAccountTraces({} as Firestore, plan, {
        deleteTestContacts: false,
        deleteDoc: mockDeleteDoc as any,
        doc: mockDoc as any,
      });

      expect(result.deletedCount).toBe(1);
      expect(deletedPaths).toEqual(['users/u-test']);
    });
  });
});
