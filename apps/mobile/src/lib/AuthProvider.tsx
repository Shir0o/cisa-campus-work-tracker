// Minimal mobile auth context — a slim counterpart to the web app's
// AuthProvider (src/components/AuthProvider.tsx). Deliberately skips the web
// provider's invitation/auto-provisioning logic: dev/e2e users already have
// an approved /users/{uid} doc. Google sign-in uses the native SDK
// (popup sign-in doesn't exist in RN) rather than the web app's
// signInWithPopup; the Sheets spreadsheets.readonly scope recovery isn't
// ported here — see MIGRATION.md's Phase 0.5 entry.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { isAppOwner, getEffectiveRole, type AppRole } from '@cisa/core';
import { auth, db, signIn } from './firebase';

GoogleSignin.configure({
  webClientId: '914549253362-reeeuatoar4altbcpcevk1r2osru0ssf.apps.googleusercontent.com',
});

export type { AppRole };

const STORAGE_KEY_MOBILE_OWNER_VIEW = 'cisa.owner_view_role';

interface AuthContextValue {
  user: User | null;
  uid: string | null;
  role: AppRole | null;
  actualRole: AppRole | null;
  isOwner: boolean;
  ownerViewRole: AppRole | null;
  setOwnerViewRole: (role: AppRole | null) => void;
  isApproved: boolean;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [ownerViewRole, setOwnerViewRoleState] = useState<AppRole | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  const isOwner = isAppOwner(user?.email);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_MOBILE_OWNER_VIEW)
      .then((saved) => {
        if (saved === 'admin' || saved === 'manager' || saved === 'operator' || saved === 'viewer') {
          setOwnerViewRoleState(saved as AppRole);
        }
      })
      .catch(() => {});
  }, []);

  const setOwnerViewRole = (nextRole: AppRole | null) => {
    setOwnerViewRoleState(nextRole);
    if (nextRole) {
      AsyncStorage.setItem(STORAGE_KEY_MOBILE_OWNER_VIEW, nextRole).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY_MOBILE_OWNER_VIEW).catch(() => {});
    }
  };

  const effectiveRole = getEffectiveRole(user?.email, actualRole, ownerViewRole);

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      unsubUserDoc?.();
      unsubUserDoc = null;

      if (!authUser) {
        setActualRole(null);
        setIsApproved(false);
        setLoading(false);
        return;
      }

      unsubUserDoc = onSnapshot(
        doc(db, 'users', authUser.uid),
        (snap) => {
          const data = snap.data() as { role?: AppRole; approved?: boolean } | undefined;
          setActualRole(data?.role ?? null);
          setIsApproved(!!data?.approved);
          setLoading(false);
        },
        () => setLoading(false),
      );
    });

    return () => {
      unsubAuth();
      unsubUserDoc?.();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    uid: user?.uid ?? null,
    role: effectiveRole,
    actualRole,
    isOwner,
    ownerViewRole,
    setOwnerViewRole,
    isApproved,
    loading,
    signInWithEmail: async (email, password) => {
      await signIn(email.trim(), password);
    },
    signInWithGoogle: async () => {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type === 'cancelled') return;
      await signInWithCredential(auth, GoogleAuthProvider.credential(response.data.idToken));
    },
    logOut: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

