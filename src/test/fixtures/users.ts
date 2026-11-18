/**
 * Test-only user fixtures — one per role.
 * These are passed directly into vi.mock('../components/AuthProvider')
 * to simulate each role without requiring Firebase or Google OAuth.
 */

export interface TestUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'manager';
  isAdmin: boolean;
  isManager: boolean;
  isApproved: boolean;
  loading: boolean;
  logOut: ReturnType<typeof vi.fn>;
  signIn: ReturnType<typeof vi.fn>;
  authorizeSheets: ReturnType<typeof vi.fn>;
}

import { vi } from 'vitest';

const base = {
  photoURL: 'https://example.com/photo.jpg',
  isApproved: true,
  loading: false,
  logOut: vi.fn(),
  signIn: vi.fn(),
  authorizeSheets: vi.fn(),
};

export const TEST_USERS = {
  admin: {
    ...base,
    uid: 'test-uid-admin',
    email: 'admin@test.cisa',
    displayName: 'Test Admin',
    role: 'admin' as const,
    isAdmin: true,
    isManager: true,
  },
  manager: {
    ...base,
    uid: 'test-uid-manager',
    email: 'manager@test.cisa',
    displayName: 'Test Manager',
    role: 'manager' as const,
    isAdmin: false,
    isManager: true,
  },
} satisfies Record<string, TestUser>;
