import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from '../components/AuthProvider';
import { onAuthStateChanged, signOut, signInWithPopup, signInWithEmailAndPassword, GoogleAuthProvider } from 'firebase/auth';
import { getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import React from 'react';

// Mocks for Firebase Auth defined inside the factory
vi.mock('firebase/auth', () => {
  const mockSignOut = vi.fn().mockResolvedValue(undefined);
  const mockSignInWithPopup = vi.fn();
  const mockSignInWithEmailAndPassword = vi.fn();
  
  class MockGoogleAuthProvider {
    addScope = vi.fn();
    static credentialFromResult = vi.fn().mockReturnValue({
      accessToken: 'mock-access-token',
    });
  }

  return {
    getAuth: vi.fn(),
    onAuthStateChanged: vi.fn(),
    signInWithPopup: mockSignInWithPopup,
    GoogleAuthProvider: MockGoogleAuthProvider,
    signOut: mockSignOut,
    signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
  };
});

// Mocks for Firebase Firestore
let mockOnSnapshotCallback: any = null;

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn((_, callback) => {
    mockOnSnapshotCallback = callback;
    return vi.fn(); // unsubscribe
  }),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
}));

const TestComponent = () => {
  const { user, isAdmin, isManager, role, isApproved, loading, authorizeSheets, signIn, signInWithEmail, logOut } = useAuth();
  
  if (loading) return <div>Loading Auth...</div>;
  if (!user) return <div>Not logged in</div>;
  return (
    <div>
      <div>User: {user.email}</div>
      <div>isAdmin: {isAdmin.toString()}</div>
      <div>isManager: {isManager.toString()}</div>
      <div>role: {role}</div>
      <div>isApproved: {isApproved.toString()}</div>
      <button onClick={() => authorizeSheets()}>Authorize Sheets</button>
      <button onClick={() => signIn()}>Sign In Google</button>
      <button onClick={() => signInWithEmail('test@campus.edu', 'password')}>Sign In Email</button>
      <button onClick={() => logOut()}>Log Out</button>
    </div>
  );
};

describe('AuthProvider', () => {
  const originalAlert = window.alert;

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    mockOnSnapshotCallback = null;
  });

  afterEach(() => {
    window.alert = originalAlert;
  });

  it('renders loading state initially', () => {
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
      return vi.fn();
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

  it('signs out and alerts an uninvited user who has no admin claim', async () => {
    const mockUser = {
      uid: 'uninvited-uid',
      email: 'uninvited@example.com',
      displayName: 'Uninvited User',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    // Mock doc(db, 'users', uid) to return no existing user doc
    // Mock doc(db, 'invitations', email) to return no invitation
    (getDoc as any).mockImplementation((docRef: any) => {
      return Promise.resolve({
        exists: () => false,
        data: () => null
      });
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith(
        "Access Denied: Your account has not been added by an administrator yet."
      );
      expect(screen.getByText('Not logged in')).toBeInTheDocument();
    });
  });

  it('creates a new user doc using invitation details when present', async () => {
    const mockUser = {
      uid: 'invited-uid',
      email: 'invited@example.com',
      displayName: 'Invited User',
      photoURL: 'photo.jpg',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.path === 'users/invited-uid') {
        return Promise.resolve({
          exists: () => false,
        });
      }
      if (docRef.path === 'invitations/invited@example.com') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: 'operator',
            approved: true,
          }),
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/invited-uid' }),
        expect.objectContaining({
          email: 'invited@example.com',
          displayName: 'Invited User',
          photoURL: 'photo.jpg',
          approved: true,
          role: 'operator',
        })
      );
      expect(deleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'invitations/invited@example.com' })
      );
      expect(screen.getByText('User: invited@example.com')).toBeInTheDocument();
      expect(screen.getByText('role: operator')).toBeInTheDocument();
      expect(screen.getByText('isApproved: true')).toBeInTheDocument();
      expect(screen.getByText('isManager: false')).toBeInTheDocument();
      expect(screen.getByText('isAdmin: false')).toBeInTheDocument();
    });
  });

  it('upgrades an existing user to admin automatically if they have the admin custom claim', async () => {
    const mockUser = {
      uid: 'admin-uid',
      email: 'admin@example.com',
      displayName: 'Admin User',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'operator', // not admin in firestore
        approved: false,   // not approved in firestore
      })
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/admin-uid' }),
        {
          role: 'admin',
          approved: true,
        }
      );
      expect(screen.getByText('role: admin')).toBeInTheDocument();
      expect(screen.getByText('isAdmin: true')).toBeInTheDocument();
      expect(screen.getByText('isManager: true')).toBeInTheDocument();
      expect(screen.getByText('isApproved: true')).toBeInTheDocument();
    });
  });

  it('updates state dynamically in response to real-time Firestore user doc changes', async () => {
    const mockUser = {
      uid: 'listener-uid',
      email: 'listener@example.com',
      displayName: 'Listener User',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'viewer',
        approved: true,
      })
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('role: viewer')).toBeInTheDocument();
    });

    expect(mockOnSnapshotCallback).not.toBeNull();

    // Trigger onSnapshot update changing role to manager, wrapped in act
    act(() => {
      mockOnSnapshotCallback({
        exists: () => true,
        data: () => ({
          role: 'manager',
          approved: true,
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText('role: manager')).toBeInTheDocument();
      expect(screen.getByText('isManager: true')).toBeInTheDocument();
      expect(screen.getByText('isAdmin: false')).toBeInTheDocument();
    });
  });

  it('handles sign in, logout, and google sheet authorization functions', async () => {
    const mockUser = {
      uid: 'func-uid',
      email: 'func@example.com',
      displayName: 'Func User',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'manager',
        approved: true,
      })
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('User: func@example.com')).toBeInTheDocument();
    });

    // Test sign in Google
    const signInBtn = screen.getByRole('button', { name: 'Sign In Google' });
    fireEvent.click(signInBtn);
    expect(signInWithPopup).toHaveBeenCalled();

    // Test sign in Email
    const signInEmailBtn = screen.getByRole('button', { name: 'Sign In Email' });
    fireEvent.click(signInEmailBtn);
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.any(Object),
      'test@campus.edu',
      'password'
    );

    // Test sheet authorization
    (signInWithPopup as any).mockResolvedValueOnce({ user: {} });
    const authSheetsBtn = screen.getByRole('button', { name: 'Authorize Sheets' });
    fireEvent.click(authSheetsBtn);
    expect(signInWithPopup).toHaveBeenCalled();

    // Test logout
    const logOutBtn = screen.getByRole('button', { name: 'Log Out' });
    fireEvent.click(logOutBtn);
    expect(signOut).toHaveBeenCalled();
  });

  it('correctly sets isOwner and allows ownerViewRole switching for app owner', async () => {
    const ownerUser = {
      uid: 'owner-uid',
      email: 'yilongwang05@gmail.com',
      displayName: 'App Owner',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(ownerUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'admin',
        approved: true,
      })
    });

    const OwnerTestComponent = () => {
      const { isOwner, role, actualRole, ownerViewRole, setOwnerViewRole } = useAuth();
      return (
        <div>
          <div>isOwner: {isOwner.toString()}</div>
          <div>role: {role}</div>
          <div>actualRole: {actualRole}</div>
          <div>ownerViewRole: {ownerViewRole || 'none'}</div>
          <button onClick={() => setOwnerViewRole('operator')}>Set Student</button>
          <button onClick={() => setOwnerViewRole(null)}>Reset</button>
        </div>
      );
    };

    render(
      <AuthProvider>
        <OwnerTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('isOwner: true')).toBeInTheDocument();
      expect(screen.getByText('role: admin')).toBeInTheDocument();
      expect(screen.getByText('actualRole: admin')).toBeInTheDocument();
    });

    // Switch view to operator (Student)
    fireEvent.click(screen.getByRole('button', { name: 'Set Student' }));

    await waitFor(() => {
      expect(screen.getByText('role: operator')).toBeInTheDocument();
      expect(screen.getByText('actualRole: admin')).toBeInTheDocument();
      expect(screen.getByText('ownerViewRole: operator')).toBeInTheDocument();
    });

    // Reset view
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect(screen.getByText('role: admin')).toBeInTheDocument();
      expect(screen.getByText('ownerViewRole: none')).toBeInTheDocument();
    });
  });

  it('allows ownerViewRole switching for non-owner admin users', async () => {
    const adminUser = {
      uid: 'admin-uid-2',
      email: 'kevinwmunga@gmail.com',
      displayName: 'Kevin Munga',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(adminUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'admin',
        approved: true,
      })
    });

    const AdminTestComponent = () => {
      const { isOwner, role, actualRole, ownerViewRole, setOwnerViewRole } = useAuth();
      return (
        <div>
          <div>isOwner: {isOwner.toString()}</div>
          <div>role: {role}</div>
          <div>actualRole: {actualRole}</div>
          <div>ownerViewRole: {ownerViewRole || 'none'}</div>
          <button onClick={() => setOwnerViewRole('manager')}>Set Trainee</button>
        </div>
      );
    };

    render(
      <AuthProvider>
        <AdminTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('isOwner: true')).toBeInTheDocument();
      expect(screen.getByText('role: admin')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set Trainee' }));

    await waitFor(() => {
      expect(screen.getByText('role: manager')).toBeInTheDocument();
      expect(screen.getByText('actualRole: admin')).toBeInTheDocument();
      expect(screen.getByText('ownerViewRole: manager')).toBeInTheDocument();
    });
  });

  it('guarantees effectiveUserId is user.uid and clears stale impersonation for unauthorized users', async () => {
    localStorage.setItem('cisa.impersonate.v1', 'staff:cisa-admin');
    localStorage.setItem('cisa_owner_view_role', 'admin');

    const viewerUser = {
      uid: 'reviewer-uid',
      email: 'reviewer-appstore@campus.edu',
      displayName: 'App Store Reviewer',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(viewerUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'viewer',
        approved: true,
      })
    });

    const ImpersonationTestComponent = () => {
      const { user, effectiveUserId, isOwner, impersonateTarget } = useAuth();
      return (
        <div>
          <div>userUid: {user?.uid}</div>
          <div>effectiveUserId: {effectiveUserId}</div>
          <div>isOwner: {isOwner.toString()}</div>
          <div>hasTarget: {(!!impersonateTarget).toString()}</div>
        </div>
      );
    };

    render(
      <AuthProvider>
        <ImpersonationTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('userUid: reviewer-uid')).toBeInTheDocument();
      expect(screen.getByText('effectiveUserId: reviewer-uid')).toBeInTheDocument();
      expect(screen.getByText('isOwner: false')).toBeInTheDocument();
      expect(screen.getByText('hasTarget: false')).toBeInTheDocument();
    });

    expect(localStorage.getItem('cisa.impersonate.v1')).toBeNull();
    expect(localStorage.getItem('cisa_owner_view_role')).toBeNull();
  });

  it('clears impersonation and ownerViewRole from localStorage on logOut', async () => {
    localStorage.setItem('cisa.impersonate.v1', 'persona:student');
    localStorage.setItem('cisa_owner_view_role', 'operator');

    const adminUser = {
      uid: 'admin-uid',
      email: 'admin@example.com',
      displayName: 'Admin',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } })
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(adminUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'admin',
        approved: true,
      })
    });

    const LogoutTestComponent = () => {
      const { logOut, effectiveUserId } = useAuth();
      return (
        <div>
          <div>effectiveUserId: {effectiveUserId}</div>
          <button onClick={() => logOut()}>Log Out</button>
        </div>
      );
    };

    render(
      <AuthProvider>
        <LogoutTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log Out' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(localStorage.getItem('cisa.impersonate.v1')).toBeNull();
      expect(localStorage.getItem('cisa_owner_view_role')).toBeNull();
    });
  });

  it('populates user displayName from firestore doc when authUser displayName is missing', async () => {
    const emailUser = {
      uid: 'reviewer-uid-2',
      email: 'reviewer-appstore@yourdomain.com',
      displayName: null,
      photoURL: null,
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(emailUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'App Store Reviewer',
        photoURL: 'https://example.com/rev.png',
        role: 'admin',
        approved: true,
      }),
    });

    const ProfileTestComponent = () => {
      const { user } = useAuth();
      return (
        <div>
          <div>displayName: {user?.displayName}</div>
          <div>photoURL: {user?.photoURL}</div>
        </div>
      );
    };

    render(
      <AuthProvider>
        <ProfileTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('displayName: App Store Reviewer')).toBeInTheDocument();
      expect(screen.getByText('photoURL: https://example.com/rev.png')).toBeInTheDocument();
    });
  });

  it('updates effectiveUserId when owner impersonates a target or simulates a role', async () => {
    const adminUser = {
      uid: 'admin-uid',
      email: 'admin@cisa.campus',
      displayName: 'Admin User',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(adminUser);
      return vi.fn();
    });

    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'admin',
        approved: true,
      }),
    });

    const ImpersonationSwitchComponent = () => {
      const { effectiveUserId, effectiveUserName, setImpersonateTarget, setOwnerViewRole } = useAuth();
      return (
        <div>
          <div data-testid="effective-uid">{effectiveUserId}</div>
          <div data-testid="effective-name">{effectiveUserName}</div>
          <button
            onClick={() =>
              setImpersonateTarget({
                key: 'staff:tr-88',
                name: 'Trainee 88',
                initials: 'T8',
                sub: 'Trainee',
                note: 'The trainee workspace',
                role: 'manager',
                persona: { id: 'trainee', staffId: 'tr-88', name: 'Trainee 88', role: 'Trainee', initials: 'T8', first: 'Trainee' },
              })
            }
          >
            Impersonate Trainee 88
          </button>
          <button
            onClick={() => {
              setImpersonateTarget(null);
              setOwnerViewRole('manager');
            }}
          >
            Simulate Trainee Role
          </button>
        </div>
      );
    };

    render(
      <AuthProvider>
        <ImpersonationSwitchComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('effective-uid')).toHaveTextContent('admin-uid');
      expect(screen.getByTestId('effective-name')).toHaveTextContent('Admin User');
    });

    fireEvent.click(screen.getByText('Impersonate Trainee 88'));
    expect(screen.getByTestId('effective-uid')).toHaveTextContent('tr-88');
    expect(screen.getByTestId('effective-name')).toHaveTextContent('Trainee 88');

    fireEvent.click(screen.getByText('Simulate Trainee Role'));
    expect(screen.getByTestId('effective-uid')).toHaveTextContent('cisa-trainee');
    expect(screen.getByTestId('effective-name')).toHaveTextContent('Trainee');
  });

  it('clears loading state when user doc fetch throws an error', async () => {
    const mockUser = {
      uid: 'error-uid',
      email: 'error@example.com',
      displayName: 'Error User',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    (getDoc as any).mockRejectedValue(new Error('Firestore network error'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading Auth...')).not.toBeInTheDocument();
      expect(screen.getByText('User: error@example.com')).toBeInTheDocument();
    });
  });

  it('clears loading state and handles error when provisioning new user doc throws', async () => {
    const mockUser = {
      uid: 'prov-error-uid',
      email: 'prov-error@example.com',
      displayName: 'Prov Error User',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
    };

    (onAuthStateChanged as any).mockImplementation((auth: any, callback: any) => {
      callback(mockUser);
      return vi.fn();
    });

    (getDoc as any).mockImplementation((docRef: any) => {
      if (docRef.path === 'users/prov-error-uid') {
        return Promise.resolve({ exists: () => false });
      }
      if (docRef.path === 'invitations/prov-error@example.com') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({ role: 'manager', approved: true }),
        });
      }
      return Promise.resolve({ exists: () => false });
    });

    (setDoc as any).mockRejectedValueOnce(new Error('Permission denied or network failure on setDoc'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading Auth...')).not.toBeInTheDocument();
      expect(screen.getByText('User: prov-error@example.com')).toBeInTheDocument();
    });
  });
});

