// Minimal mobile auth context — a slim counterpart to the web app's
// AuthProvider (src/components/AuthProvider.tsx). Deliberately skips the web
// provider's invitation/auto-provisioning and Google-popup/Sheets logic:
// dev/e2e users already have an approved /users/{uid} doc, and native Google
// Sign-In is a separate Phase 0.5 spike (popup sign-in doesn't exist in RN).
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, signIn } from './firebase';

export type AppRole = 'admin' | 'manager' | 'operator' | 'viewer';

interface AuthContextValue {
  user: User | null;
  uid: string | null;
  role: AppRole | null;
  isApproved: boolean;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      unsubUserDoc?.();
      unsubUserDoc = null;

      if (!authUser) {
        setRole(null);
        setIsApproved(false);
        setLoading(false);
        return;
      }

      unsubUserDoc = onSnapshot(
        doc(db, 'users', authUser.uid),
        (snap) => {
          const data = snap.data() as { role?: AppRole; approved?: boolean } | undefined;
          setRole(data?.role ?? null);
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
    role,
    isApproved,
    loading,
    signInWithEmail: async (email, password) => {
      await signIn(email.trim(), password);
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
