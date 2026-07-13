// Firebase for React Native — the JS SDK (firebase/*), same API as the web app
// so the data-access layer ports as a copy. Only the bootstrapping differs:
//  • initializeAuth + getReactNativePersistence(AsyncStorage) instead of getAuth
//  • config from EXPO_PUBLIC_* env (falls back to the shared static config)
//  • the SAME named Firestore database id + opt-in RTDB URL as the web app
//
// Mirrors src/lib/firebase.ts from the web app (firebase-applet-config.json).
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';
import type { SystemActivity, Notification } from '@cisa/core';

// Static fallback (matches firebase-applet-config.json). apiKey is intentionally
// blank here — it must come from the environment.
const staticConfig = {
  projectId: 'sac-campus-hub',
  appId: '1:914549253362:web:8a1b1aeca702d3ba0f1c6b',
  apiKey: '',
  authDomain: 'sac-campus-hub.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897',
  storageBucket: 'sac-campus-hub.firebasestorage.app',
  messagingSenderId: '914549253362',
};

const env = process.env;

const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || staticConfig.apiKey,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || staticConfig.authDomain,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || staticConfig.projectId,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID || staticConfig.appId,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || staticConfig.storageBucket,
  messagingSenderId:
    env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || staticConfig.messagingSenderId,
};

const firestoreDatabaseId =
  env.EXPO_PUBLIC_FIREBASE_FIRESTORE_DB_ID || staticConfig.firestoreDatabaseId;
const databaseURL = env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || undefined;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firebase JS SDK v12 removed getReactNativePersistence: on React Native, auth
// now auto-wires AsyncStorage persistence via the package's "react-native"
// export condition + the installed @react-native-async-storage/async-storage; on
// web it uses IndexedDB/local persistence. getAuth is idempotent, so it's safe
// under Fast Refresh (no double-initialize throw).
export const auth: Auth = getAuth(app);

export const db: Firestore = getFirestore(app, firestoreDatabaseId);

// Realtime Database — the live transport for The Board's collaborative editor.
// Opt-in: only initialized when a URL is configured, so the app runs before RTDB
// is enabled. When null, The Board falls back to Firestore-only editing.
export const rtdb: Database | null = databaseURL ? getDatabase(app, databaseURL) : null;

/** Email/password sign-in (the test users, and the fallback login path). */
export function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const info = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
  };
  console.error('Firestore Error: ', JSON.stringify(info));
  throw new Error(JSON.stringify(info));
}

export async function logActivity(
  activity: Omit<SystemActivity, 'id' | 'createdAt' | 'userId' | 'userName' | 'userPhoto'>,
) {
  if (!auth.currentUser) return;
  try {
    await addDoc(collection(db, 'activities'), {
      ...activity,
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || 'Anonymous',
      userPhoto: auth.currentUser.photoURL || '',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

export async function sendNotification(
  notification: Omit<Notification, 'id' | 'createdAt' | 'read'>,
) {
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
