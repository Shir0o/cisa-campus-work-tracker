import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { sleep } from '../lib/utils';

import { isAppOwner, canSimulateRole, getEffectiveRole, AppRole } from '../lib/permissions';
import { ImpersonateTarget } from '../types';
import { Impersonation, meIdFor, identityKey } from '../lib/impersonate';

interface AuthContextType {
  user: User | null;
  effectiveUserId: string | null;
  effectiveIdentityKey: string;
  isAdmin: boolean;
  isManager: boolean;
  role: string | null;
  actualRole: string | null;
  isApproved: boolean;
  loading: boolean;
  isOwner: boolean;
  ownerViewRole: AppRole | null;
  setOwnerViewRole: (role: AppRole | null) => void;
  impersonateTarget: ImpersonateTarget | null;
  setImpersonateTarget: (target: ImpersonateTarget | null) => void;
  authorizeSheets: () => Promise<string | null>;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY_OWNER_VIEW = 'cisa_owner_view_role';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [impersonateTarget, setImpersonateTargetState] = useState<ImpersonateTarget | null>(() => {
    if (typeof window !== 'undefined') {
      return Impersonation.current();
    }
    return null;
  });
  const [ownerViewRole, setOwnerViewRoleState] = useState<AppRole | null>(() => {
    if (typeof window !== 'undefined') {
      const imp = Impersonation.current();
      if (imp) return imp.role;
      const saved = localStorage.getItem(STORAGE_KEY_OWNER_VIEW);
      if (saved === 'admin' || saved === 'manager' || saved === 'operator' || saved === 'viewer') {
        return saved as AppRole;
      }
    }
    return null;
  });
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const isOwner = canSimulateRole(actualRole as AppRole, user?.email);

  const setOwnerViewRole = (nextRole: AppRole | null) => {
    setOwnerViewRoleState(nextRole);
    if (typeof window !== 'undefined') {
      if (nextRole) {
        localStorage.setItem(STORAGE_KEY_OWNER_VIEW, nextRole);
      } else {
        localStorage.removeItem(STORAGE_KEY_OWNER_VIEW);
      }
    }
  };

  const setImpersonateTarget = (target: ImpersonateTarget | null) => {
    setImpersonateTargetState(target);
    if (target) {
      Impersonation.set(target.key);
      setOwnerViewRole(target.role);
    } else {
      Impersonation.set(null);
      setOwnerViewRole(null);
    }
  };

  const effectiveRole = getEffectiveRole(user?.email, actualRole as AppRole, ownerViewRole);
  const isAdmin = effectiveRole === 'admin';
  const isManager = effectiveRole === 'admin' || effectiveRole === 'manager';

  const effectiveUserId = impersonateTarget
    ? meIdFor(impersonateTarget.persona)
    : (user?.uid || null);

  const effectiveIdentityKey = impersonateTarget
    ? identityKey(impersonateTarget.persona, impersonateTarget.role)
    : (effectiveRole || null);

  useEffect(() => {
    let userDocUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);
      setUser(authUser);

      if (userDocUnsubscribe) {
        userDocUnsubscribe();
        userDocUnsubscribe = null;
      }

      if (authUser) {
        const idTokenResult = await authUser.getIdTokenResult();
        const isAdminClaim = !!idTokenResult.claims.admin;
        const userEmail = authUser.email?.toLowerCase();
        if (!userEmail) return;

        // Initial setup/check
        const userDocRef = doc(db, 'users', authUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          // Check for invitation
          const inviteRef = doc(db, 'invitations', userEmail);
          const inviteDoc = await getDoc(inviteRef);
          
          let initialRole: 'admin' | 'manager' | 'operator' | 'viewer' = isAdminClaim ? 'admin' : 'viewer';
          let initialApproved = isAdminClaim;

          if (inviteDoc.exists()) {
            const inviteData = inviteDoc.data();
            initialRole = inviteData.role;
            initialApproved = inviteData.approved;
          } else if (!isAdminClaim && userEmail !== 'yilongwang05@gmail.com') {
            // Uninvited user attempting to log in
            await signOut(auth);
            setUser(null);
            setLoading(false);
            alert("Access Denied: Your account has not been added by an administrator yet.");
            return;
          }

          // Email/password accounts have no displayName/photoURL; the Firestore
          // rules require displayName to be a non-null string, so fall back to
          // the local part of the email (or a default) when the provider has none.
          const fallbackName = authUser.email?.split('@')[0] || 'Member';
          const initialData = {
            email: authUser.email,
            displayName: authUser.displayName || fallbackName,
            photoURL: authUser.photoURL || '',
            approved: initialApproved,
            role: initialRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userDocRef, initialData);
          
          if (inviteDoc.exists()) {
            try {
              const { deleteDoc } = await import('firebase/firestore');
              await deleteDoc(inviteRef);
            } catch (error) {
              console.warn('Failed to delete invitation:', error);
            }
          }

          setIsApproved(initialApproved);
          setActualRole(initialRole);
        } else {
          // Document exists, set initial state before listener starts
          const data = userDoc.data();

          if (isAdminClaim && (data.role !== 'admin' || !data.approved)) {
            try {
              const { updateDoc } = await import('firebase/firestore');
              await updateDoc(userDocRef, {
                role: 'admin',
                approved: true
              });
            } catch(e) {
              console.error('Failed to auto-upgrade custom claim admin', e);
            }
          }

          const currentRole = data.role as string;
          setIsApproved(data.approved || isAdminClaim);
          const effective = isAdminClaim ? 'admin' : currentRole;
          setActualRole(effective);
        }

        // Listen for real-time changes to the user's record
        userDocUnsubscribe = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            setIsApproved(data.approved || isAdminClaim);
            const currentRole = data.role as string;
            const effective = isAdminClaim ? 'admin' : currentRole;
            setActualRole(effective);
          }
        });

      } else {
        setActualRole(null);
        setIsApproved(false);
      }
      
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (userDocUnsubscribe) userDocUnsubscribe();
    };
  }, []);

  const authorizeSheets = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      setAccessToken(token);
      return token;
    } catch (error) {
      console.error('Failed to authorize sheets:', error);
      return null;
    }
  };

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const logOut = async () => {
    await signOut(auth);
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        effectiveUserId,
        effectiveIdentityKey,
        isAdmin,
        isManager,
        role: effectiveRole,
        actualRole,
        isApproved,
        loading,
        isOwner,
        ownerViewRole,
        setOwnerViewRole,
        impersonateTarget,
        setImpersonateTarget,
        authorizeSheets,
        signIn,
        signInWithEmail,
        logOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

