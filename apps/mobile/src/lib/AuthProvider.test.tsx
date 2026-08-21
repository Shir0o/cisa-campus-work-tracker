import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { AuthProvider, useAuth } from './AuthProvider';

let mockAuthStateCallback: any = null;
let mockOnSnapshotCallback: any = null;

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  getReactNativePersistence: jest.fn(),
  onAuthStateChanged: jest.fn((_auth, callback) => {
    mockAuthStateCallback = callback;
    return jest.fn(); // unsubscribe
  }),
  signInWithEmailAndPassword: jest.fn().mockResolvedValue({ user: { uid: 'u123', email: 'test@example.com' } }),
  signInWithCredential: jest.fn().mockResolvedValue({ user: { uid: 'u123', email: 'test@example.com' } }),
  signOut: jest.fn().mockResolvedValue(undefined),
  GoogleAuthProvider: {
    credential: jest.fn().mockReturnValue({ providerId: 'google.com' }),
  },
}));

// The walking-pairs sync is exercised in AuthProvider via a subscription; mock
// the Firestore wrapper so tests don't need a real Firestore instance.
jest.mock('./data/walkingPairs', () => ({
  subscribeWalkingPairs: jest.fn(() => jest.fn()),
  saveWalkingPairs: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  onSnapshot: jest.fn((_ref, callback) => {
    mockOnSnapshotCallback = callback;
    return jest.fn(); // unsubscribe
  }),
}));

function Consumer() {
  const { user, uid, role, loading, isApproved, isOwner, signInWithGoogle, logOut } = useAuth();
  if (loading) return <Text>Loading Auth...</Text>;
  return (
    <>
      <Text>{user ? user.email : 'Signed Out'}</Text>
      <Text>{uid ? `UID: ${uid}` : 'No UID'}</Text>
      <Text>{role ? `Role: ${role}` : 'No Role'}</Text>
      <Text>{isApproved ? 'Approved' : 'Not Approved'}</Text>
      <Text>{isOwner ? 'Is Owner' : 'Not Owner'}</Text>
      <Pressable onPress={() => void signInWithGoogle()}>
        <Text>Google Sign In</Text>
      </Pressable>
      <Pressable onPress={() => void logOut()}>
        <Text>Log Out</Text>
      </Pressable>
    </>
  );
}

describe('AuthProvider (Mobile)', () => {
  it('configures GoogleSignin with both webClientId and iosClientId', () => {
    expect(GoogleSignin.configure).toHaveBeenCalledWith({
      webClientId: '914549253362-reeeuatoar4altbcpcevk1r2osru0ssf.apps.googleusercontent.com',
      iosClientId: '914549253362-hhbk7nk5o8g4qken9kbap3bl8jqkcdo5.apps.googleusercontent.com',
    });
  });

  it('renders initial signed-out state when onAuthStateChanged fires with null', async () => {
    const { getByText } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    act(() => {
      mockAuthStateCallback?.(null);
    });

    await waitFor(() => {
      expect(getByText('Signed Out')).toBeTruthy();
      expect(getByText('No UID')).toBeTruthy();
    });
  });

  it('updates state when an authenticated user is emitted', async () => {
    const { getByText } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    act(() => {
      mockAuthStateCallback?.({ uid: 'u123', email: 'reviewer@example.com' });
    });

    act(() => {
      mockOnSnapshotCallback?.({
        data: () => ({ role: 'admin', approved: true, displayName: 'Reviewer' }),
      });
    });

    await waitFor(() => {
      expect(getByText('reviewer@example.com')).toBeTruthy();
      expect(getByText('Role: admin')).toBeTruthy();
      expect(getByText('Approved')).toBeTruthy();
    });
  });

  it('calls GoogleSignin.signIn on signInWithGoogle', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      data: { idToken: 'mock-id-token' },
    });

    const { getByText } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    act(() => {
      mockAuthStateCallback?.(null);
    });

    await waitFor(() => {
      expect(getByText('Google Sign In')).toBeTruthy();
    });

    const btn = getByText('Google Sign In');
    await act(async () => {
      fireEvent.press(btn);
    });

    expect(GoogleSignin.hasPlayServices).toHaveBeenCalled();
    expect(GoogleSignin.signIn).toHaveBeenCalled();
  });
});
