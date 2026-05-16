import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../components/AuthProvider';
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc } from 'firebase/firestore';
import React from 'react';

// Mock Firebase dependencies
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn((_, callback) => {
    // Return an unsubscribe function
    return vi.fn();
  }),
  serverTimestamp: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
}));

const TestComponent = () => {
  const { user, isAdmin, isManager, isApproved, loading } = useAuth();
  
  if (loading) return <div>Loading Auth...</div>;
  if (!user) return <div>Not logged in</div>;
  return (
    <div>
      <div>User: {user.email}</div>
      <div>isAdmin: {isAdmin.toString()}</div>
      <div>isManager: {isManager.toString()}</div>
      <div>isApproved: {isApproved.toString()}</div>
    </div>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    // Mock onAuthStateChanged to do nothing initially
    (onAuthStateChanged as any).mockImplementation(() => vi.fn());
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    expect(screen.getByText('Loading Auth...')).toBeInTheDocument();
  });

  it('renders unauthenticated state when no user is present', async () => {
    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(null);
      return vi.fn(); // unsubscribe
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Not logged in')).toBeInTheDocument();
    });
  });

  it('authenticates and sets correct custom claim permissions', async () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'photo.jpg',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    // Mock new user doc setup
    (getDoc as any).mockResolvedValue({
      exists: () => false,
      data: () => null
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('User: user@example.com')).toBeInTheDocument();
      expect(screen.getByText('isAdmin: true')).toBeInTheDocument();
      expect(screen.getByText('isManager: true')).toBeInTheDocument();
      expect(screen.getByText('isApproved: true')).toBeInTheDocument();
    });
  });
});
