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
  authorizeSheets: () => Promise<string | null>;
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
  const [accessToken, setAccessToken] = useState<string | null>(null);

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
          
          if (inviteDoc.exists()) {
            try {
              const { deleteDoc } = await import('firebase/firestore');
              await deleteDoc(inviteRef);
            } catch (error) {
              console.warn('Failed to delete invitation:', error);
            }
          }

          setIsApproved(initialApproved);
          setIsAdmin(initialRole === 'admin');
          setIsManager(initialRole === 'admin' || initialRole === 'manager');
          setRole(initialRole);
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
          const effectiveRole = isAdminClaim ? 'admin' : currentRole;
          setRole(effectiveRole);
          setIsAdmin(effectiveRole === 'admin' || isAdminClaim);
          setIsManager(effectiveRole === 'admin' || effectiveRole === 'manager' || isAdminClaim);
        }

        // Listen for real-time changes to the user's record
        userDocUnsubscribe = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            setIsApproved(data.approved || isAdminClaim);
            const currentRole = data.role as string;
            const effectiveRole = isAdminClaim ? 'admin' : currentRole;
            setRole(effectiveRole);
            setIsAdmin(effectiveRole === 'admin' || isAdminClaim);
            setIsManager(effectiveRole === 'admin' || effectiveRole === 'manager' || isAdminClaim);
          }
        });

      } else {
        setIsAdmin(false);
        setIsManager(false);
        setRole(null);
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

  const logOut = async () => {
    await signOut(auth);
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, isManager, role, isApproved, loading, authorizeSheets, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
