// Firebase for React Native — the JS SDK (firebase/*), same API as the web app
// so the data-access layer ports as a copy. Only the bootstrapping differs:
//  • initializeAuth + getReactNativePersistence(AsyncStorage) instead of getAuth
//  • config from EXPO_PUBLIC_* env (falls back to the shared static config)
//  • the SAME named Firestore database id + opt-in RTDB URL as the web app
//
// Mirrors src/lib/firebase.ts from the web app (firebase-applet-config.json).
import { Platform } from 'react-native';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
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

// NOTE: each EXPO_PUBLIC_* var below must be a literal `process.env.EXPO_PUBLIC_X`
// expression (not aliased/destructured) — Expo's babel plugin statically replaces
// only that exact shape when building a production web export; an alias like
// `const env = process.env` defeats it, leaving a dead runtime lookup that's
// undefined in the exported bundle (dev mode masks this via a live process.env
// polyfill, so it only surfaces after `expo export -p web`).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || staticConfig.apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || staticConfig.authDomain,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || staticConfig.projectId,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || staticConfig.appId,
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || staticConfig.storageBucket,
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || staticConfig.messagingSenderId,
};

const firestoreDatabaseId =
  process.env.EXPO_PUBLIC_FIREBASE_FIRESTORE_DB_ID || staticConfig.firestoreDatabaseId;
const databaseURL = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || undefined;

if (__DEV__ && !firebaseConfig.apiKey) {
  console.warn(
    'EXPO_PUBLIC_FIREBASE_API_KEY is unset — sign-in and Firestore reads will fail. Set it in apps/mobile/.env.',
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Configure Firebase Auth persistence:
// On native (iOS / Android), initialize with getReactNativePersistence + AsyncStorage.
// On web (or if already initialized during Fast Refresh), fall back to standard getAuth.
function getFirebaseAuth(): Auth {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }
  try {
    const { getReactNativePersistence } = require('firebase/auth');
    return initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch (_e) {
    return getAuth(app);
  }
}

export const auth: Auth = getFirebaseAuth();

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
  options?: { rethrow?: boolean },
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
  if (options?.rethrow === false) return;
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
