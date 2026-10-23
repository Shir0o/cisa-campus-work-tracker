import { describe, it, expect } from 'vitest';
import { isTestAccount, selectedPurgePaths, purgeTotal, type PurgePlan } from '../lib/testAccountPurge';

const emptyPlan = (): PurgePlan => ({
  accounts: [],
  logins: [],
  invitations: [],
  personal: [],
  interactions: [],
  notes: [],
  chats: [],
  activity: [],
  asks: [],
  feedback: [],
  contacts: [],
  keptSelf: [],
});

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
      expect(isTestAccount({ email: 'cisa.qa@gmail.com' })).toBe(true);
      expect(isTestAccount({ displayName: 'cisa-test' })).toBe(true);
    });

    it('does not match a real address that merely starts with "cisa"', () => {
      expect(isTestAccount({ email: 'cisacampus@gmail.com', displayName: 'Campus Office' })).toBe(false);
      expect(isTestAccount({ email: 'cisaleader@campus.edu' })).toBe(false);
    });

    it('returns false for real campus users and team members', () => {
      expect(isTestAccount({ email: 'sarah.lee@campus.edu', displayName: 'Sarah Lee' })).toBe(false);
      expect(isTestAccount({ email: 'yilongwang05@gmail.com', displayName: 'Tony Wang' })).toBe(false);
      expect(isTestAccount({ email: 'john@example.com', displayName: 'John Doe' })).toBe(false);
    });
  });

  describe('selectedPurgePaths / purgeTotal', () => {
    it('leaves contacts out unless they are opted in', () => {
      const plan = { ...emptyPlan(), accounts: ['users/u1'], contacts: ['contacts/c1'], logins: ['u1'] };
      expect(selectedPurgePaths(plan, false)).toEqual(['users/u1']);
      expect(purgeTotal(plan, false)).toBe(2);
      expect(selectedPurgePaths(plan, true)).toEqual(['contacts/c1', 'users/u1']);
      expect(purgeTotal(plan, true)).toBe(3);
    });

    it('drops targets nested under an opted-in contact, which the contact delete already covers', () => {
      const plan = {
        ...emptyPlan(),
        interactions: ['contacts/c1/interactions/i1', 'contacts/c2/interactions/i2', 'contacts/c10/interactions/i3'],
        notes: ['contacts/c1/comments/m1'],
        contacts: ['contacts/c1'],
      };
      expect(selectedPurgePaths(plan, true)).toEqual([
        'contacts/c2/interactions/i2',
        'contacts/c10/interactions/i3',
        'contacts/c1',
      ]);
      expect(purgeTotal(plan, false)).toBe(4);
    });

    it('deletes traces before the account docs that own them', () => {
      const plan = { ...emptyPlan(), accounts: ['users/u1'], personal: ['userPreferences/u1'], invitations: ['invitations/x'] };
      expect(selectedPurgePaths(plan, false)).toEqual(['userPreferences/u1', 'invitations/x', 'users/u1']);
    });
  });
});
