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
import {
  isAppOwner,
  canSimulateRole,
  getEffectiveRole,
  resolveImpersonateTarget,
  meIdFor,
  identityKey,
  type AppRole,
  type ImpersonateTarget,
} from '@cisa/core';
import { auth, db, signIn } from './firebase';

GoogleSignin.configure({
  webClientId: '914549253362-reeeuatoar4altbcpcevk1r2osru0ssf.apps.googleusercontent.com',
});

export type { AppRole, ImpersonateTarget };

const STORAGE_KEY_MOBILE_OWNER_VIEW = 'cisa.owner_view_role';
const STORAGE_KEY_MOBILE_IMP_TARGET = 'cisa.impersonate.v1';

interface AuthContextValue {
  user: User | null;
  uid: string | null;
  effectiveUserId: string | null;
  effectiveIdentityKey: string | null;
  role: AppRole | null;
  actualRole: AppRole | null;
  isOwner: boolean;
  ownerViewRole: AppRole | null;
  setOwnerViewRole: (role: AppRole | null) => void;
  impersonateTarget: ImpersonateTarget | null;
  setImpersonateTarget: (target: ImpersonateTarget | null) => void;
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
  const [impersonateTarget, setImpersonateTargetState] = useState<ImpersonateTarget | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  const isOwner = canSimulateRole(actualRole, user?.email);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_MOBILE_OWNER_VIEW),
      AsyncStorage.getItem(STORAGE_KEY_MOBILE_IMP_TARGET),
    ])
      .then(([savedRole, savedTargetKey]) => {
        let role: AppRole | null = null;
        if (savedRole === 'admin' || savedRole === 'manager' || savedRole === 'operator' || savedRole === 'viewer') {
          role = savedRole as AppRole;
        }
        if (savedTargetKey) {
          const resolved = resolveImpersonateTarget(savedTargetKey);
          if (resolved) {
            setImpersonateTargetState(resolved);
            setOwnerViewRoleState(resolved.role);
            return;
          }
        }
        if (role) {
          setOwnerViewRoleState(role);
        }
      })
      .catch((err) => {
        console.warn('Could not read saved owner view preference:', err);
      });
  }, []);

  const setOwnerViewRole = (nextRole: AppRole | null) => {
    setOwnerViewRoleState(nextRole);
    if (nextRole) {
      AsyncStorage.setItem(STORAGE_KEY_MOBILE_OWNER_VIEW, nextRole).catch((err) => {
        console.warn('Could not save owner view role preference:', err);
      });
      if (impersonateTarget && impersonateTarget.role !== nextRole) {
        setImpersonateTargetState(null);
        AsyncStorage.removeItem(STORAGE_KEY_MOBILE_IMP_TARGET).catch(() => {});
      }
    } else {
      setImpersonateTargetState(null);
      AsyncStorage.removeItem(STORAGE_KEY_MOBILE_OWNER_VIEW).catch(() => {});
      AsyncStorage.removeItem(STORAGE_KEY_MOBILE_IMP_TARGET).catch(() => {});
    }
  };

  const setImpersonateTarget = (target: ImpersonateTarget | null) => {
    setImpersonateTargetState(target);
    if (target) {
      setOwnerViewRoleState(target.role);
      AsyncStorage.setItem(STORAGE_KEY_MOBILE_OWNER_VIEW, target.role).catch(() => {});
      AsyncStorage.setItem(STORAGE_KEY_MOBILE_IMP_TARGET, target.key).catch(() => {});
    } else {
      setOwnerViewRoleState(null);
      AsyncStorage.removeItem(STORAGE_KEY_MOBILE_OWNER_VIEW).catch(() => {});
      AsyncStorage.removeItem(STORAGE_KEY_MOBILE_IMP_TARGET).catch(() => {});
    }
  };

  const effectiveRole = getEffectiveRole(user?.email, actualRole, ownerViewRole);

  const effectiveUserId = impersonateTarget
    ? meIdFor(impersonateTarget.persona)
    : (ownerViewRole === 'manager'
        ? 'cisa-trainee'
        : ownerViewRole === 'operator'
        ? 'cisa-student'
        : ownerViewRole === 'viewer'
        ? 'cisa-community'
        : user?.uid || null);

  const effectiveIdentityKey = impersonateTarget
    ? identityKey(impersonateTarget.persona, impersonateTarget.role)
    : (effectiveRole || null);

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
          const data = snap.data() as { role?: AppRole; approved?: boolean; displayName?: string; photoURL?: string } | undefined;
          setActualRole(data?.role ?? null);
          setIsApproved(!!data?.approved);
          const profileDisplayName = authUser.displayName || data?.displayName || authUser.email?.split('@')[0];
          const profilePhoto = authUser.photoURL || data?.photoURL;
          if (profileDisplayName && (authUser.displayName !== profileDisplayName || authUser.photoURL !== profilePhoto)) {
            setUser((prev) => (prev ? ({ ...prev, displayName: profileDisplayName, photoURL: profilePhoto ?? prev.photoURL } as User) : prev));
          }
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
    uid: effectiveUserId,
    effectiveUserId,
    effectiveIdentityKey,
    role: effectiveRole,
    actualRole,
    isOwner,
    ownerViewRole,
    setOwnerViewRole,
    impersonateTarget,
    setImpersonateTarget,
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

