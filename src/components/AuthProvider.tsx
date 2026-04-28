import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { sleep } from '../lib/utils';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  isManager: boolean;
  role: string | null;
  isApproved: boolean;
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);

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
        const userEmail = authUser.email?.toLowerCase();
        if (!userEmail) return;

        const isSuperAdminEmail = userEmail === 'yilongwang05@gmail.com';
        
        // Initial setup/check
        const userDocRef = doc(db, 'users', authUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          // Check for invitation
          const inviteRef = doc(db, 'invitations', userEmail);
          const inviteDoc = await getDoc(inviteRef);
          
          let initialRole: 'admin' | 'manager' | 'operator' | 'viewer' = isSuperAdminEmail ? 'admin' : 'viewer';
          let initialApproved = isSuperAdminEmail;

          if (inviteDoc.exists()) {
            const inviteData = inviteDoc.data();
            initialRole = inviteData.role;
            initialApproved = inviteData.approved;
          }

          const initialData = {
            email: authUser.email,
            displayName: authUser.displayName,
            photoURL: authUser.photoURL,
            approved: initialApproved,
            role: initialRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userDocRef, initialData);
          setIsApproved(initialApproved);
          setIsAdmin(initialRole === 'admin');
          setIsManager(initialRole === 'admin' || initialRole === 'manager');
          setRole(initialRole);
        }

        // Listen for real-time changes to the user's record
        userDocUnsubscribe = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            setIsApproved(data.approved || isSuperAdminEmail);
            const currentRole = data.role as string;
            setRole(currentRole);
            setIsAdmin(currentRole === 'admin' || isSuperAdminEmail);
            setIsManager(currentRole === 'admin' || currentRole === 'manager' || isSuperAdminEmail);
          }
        });

      } else {
        setIsAdmin(false);
        setIsManager(false);
        setRole(null);
        setIsApproved(false);
      }
      await sleep(1000); // Ensure skeleton is visible for at least 1s
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (userDocUnsubscribe) userDocUnsubscribe();
    };
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logOut = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, isManager, role, isApproved, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
