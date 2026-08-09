import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const finalConfig = { ...firebaseConfig };
if (import.meta.env.VITE_FIREBASE_API_KEY) {
  finalConfig.apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
}

const app = initializeApp(finalConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);

// Cloud Storage — only visit photos live here (see storage.rules). The bucket
// name comes from firebase-applet-config.json.
export const storage = getStorage(app);

// Realtime Database — the live transport for The Board's collaborative editor.
// Opt-in: only initialized when a database URL is configured (env or config),
// so the app builds and runs even before RTDB is enabled on the project. When
// it's null, The Board falls back to Firestore-only ("Tier 0") editing.
const databaseURL =
  (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined) ||
  ((finalConfig as Record<string, unknown>).databaseURL as string | undefined) ||
  undefined;
export const rtdb: Database | null = databaseURL ? getDatabase(app, databaseURL) : null;

// E2E-only email/password sign-in helper. Exposed on window ONLY when
// VITE_E2E_MODE=true so it never ships in the production bundle. Lets
// Playwright authenticate as the real test users (Full-timer / Trainee /
// Student / Community) without going through the Google OAuth popup.
if (import.meta.env.VITE_E2E_MODE === 'true' && typeof window !== 'undefined') {
  (window as any).__e2eSignIn = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { doc, getDocFromServer, collection, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { SystemActivity, Notification } from '../types';

export async function logActivity(activity: Omit<SystemActivity, 'id' | 'createdAt' | 'userId' | 'userName' | 'userPhoto'>) {
  if (!auth.currentUser) return;

  try {
    const activityData = {
      ...activity,
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || 'Anonymous',
      userPhoto: auth.currentUser.photoURL || '',
      createdAt: new Date().toISOString(),
    };
    await addDoc(collection(db, 'activities'), activityData);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

export async function sendNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) {
  try {
    const targetRef = doc(collection(db, 'notifications'));
    await setDoc(targetRef, {
      ...notification,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. Firestore might be offline or project settings misconfigured.");
    }
  }
}
testConnection();
