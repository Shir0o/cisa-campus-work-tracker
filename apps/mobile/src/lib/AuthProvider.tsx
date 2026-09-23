// Minimal mobile auth context — a slim counterpart to the web app's
// AuthProvider (src/components/AuthProvider.tsx). Deliberately skips the web
// provider's invitation/auto-provisioning logic: dev/e2e users already have
// an approved /users/{uid} doc. Google sign-in uses the native SDK
// (popup sign-in doesn't exist in RN) rather than the web app's
// signInWithPopup; the Sheets spreadsheets.readonly scope recovery isn't
// ported here — see MIGRATION.md's Phase 0.5 entry.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut, type User } from 'firebase/auth';
import { forgetPushDevice } from './pushRegistration';
import { doc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  applyRoster,
  applyPartners,
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
import { subscribeUsers } from './data/users';
import { subscribePartners } from './data/partners';
import {
  extractMfaChallenge,
  resolveTotpSignIn,
  type PendingMfaChallenge,
} from './mfa';

GoogleSignin.configure({
  webClientId: '914549253362-reeeuatoar4altbcpcevk1r2osru0ssf.apps.googleusercontent.com',
  iosClientId: '914549253362-hhbk7nk5o8g4qken9kbap3bl8jqkcdo5.apps.googleusercontent.com',
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
  isImpersonating: boolean;
  ownerViewRole: AppRole | null;
  setOwnerViewRole: (role: AppRole | null) => void;
  impersonateTarget: ImpersonateTarget | null;
  setImpersonateTarget: (target: ImpersonateTarget | null) => void;
  isApproved: boolean;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  pendingMfa: PendingMfaChallenge | null;
  completeMfaSignIn: (otp: string) => Promise<void>;
  cancelMfa: () => void;
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
  const [pendingMfa, setPendingMfa] = useState<PendingMfaChallenge | null>(null);

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

  useEffect(() => {
    // Feed the full-timer/trainee roster from the users collection so the pure
    // lib functions know who is a full-timer (issue #549).
    return subscribeUsers((users) => {
      applyRoster(users.map((u) => ({ uid: u.uid, role: u.role })));
    });
  }, []);

  useEffect(() => {
    // Feed the gospel-partners arrangement so the mobile quick-add can stamp
    // the adder's partner as a co-creator without an extra read.
    return subscribePartners(applyPartners);
  }, []);

  const isImpersonating = isOwner && (ownerViewRole !== null || impersonateTarget !== null);

  const value: AuthContextValue = {
    user,
    uid: effectiveUserId,
    effectiveUserId,
    effectiveIdentityKey,
    role: effectiveRole,
    actualRole,
    isOwner,
    isImpersonating,
    ownerViewRole,
    setOwnerViewRole,
    impersonateTarget,
    setImpersonateTarget,
    isApproved,
    loading,
    signInWithEmail: async (email, password) => {
      try {
        await signIn(email.trim(), password);
      } catch (error) {
        const challenge = extractMfaChallenge(auth, error);
        if (challenge) {
          setPendingMfa(challenge);
          return;
        }
        throw error;
      }
    },
    signInWithGoogle: async () => {
      try {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (response.type === 'cancelled') return;
        await signInWithCredential(auth, GoogleAuthProvider.credential(response.data.idToken));
      } catch (error) {
        const challenge = extractMfaChallenge(auth, error);
        if (challenge) {
          setPendingMfa(challenge);
          return;
        }
        throw error;
      }
    },
    completeMfaSignIn: async (otp) => {
      if (!pendingMfa) throw new Error('No pending multi-factor sign-in.');
      const factor = pendingMfa.hints.find((h) => h.factorId === 'totp') ?? pendingMfa.hints[0];
      await resolveTotpSignIn(pendingMfa.resolver, factor.uid, otp);
      setPendingMfa(null);
    },
    cancelMfa: () => setPendingMfa(null),
    logOut: async () => {
      // Before signOut: only the signed-in owner may delete the device doc.
      if (user) await forgetPushDevice(user.uid);
      await signOut(auth);
    },
    pendingMfa,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

