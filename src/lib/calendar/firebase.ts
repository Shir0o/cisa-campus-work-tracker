// Firebase secondary initialization for the shared calendar (cisa-cal).
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const calFirebaseConfig = {
  apiKey:
    (import.meta.env.VITE_CALENDAR_FIREBASE_API_KEY as string) ||
    (import.meta.env.VITE_FIREBASE_API_KEY as string) ||
    'mock-api-key',
  authDomain:
    (import.meta.env.VITE_CALENDAR_FIREBASE_AUTH_DOMAIN as string) ||
    'cisa-cal.firebaseapp.com',
  projectId:
    (import.meta.env.VITE_CALENDAR_FIREBASE_PROJECT_ID as string) ||
    'cisa-cal',
  storageBucket:
    (import.meta.env.VITE_CALENDAR_FIREBASE_STORAGE_BUCKET as string) ||
    'cisa-cal.firebasestorage.app',
  messagingSenderId:
    (import.meta.env.VITE_CALENDAR_FIREBASE_MESSAGING_SENDER_ID as string) ||
    '50267769259',
  appId:
    (import.meta.env.VITE_CALENDAR_FIREBASE_APP_ID as string) ||
    'mock-app-id',
};

export const calApp =
  typeof getApps === 'function' && getApps().some((a) => a.name === 'calendar')
    ? getApp('calendar')
    : typeof initializeApp === 'function'
      ? initializeApp(calFirebaseConfig, 'calendar')
      : ({} as any);

export const calDb =
  typeof getFirestore === 'function' && calApp && typeof (calApp as any).name === 'string'
    ? getFirestore(calApp)
    : ({} as any);

export const calAuth =
  typeof getAuth === 'function' && calApp && typeof (calApp as any).name === 'string'
    ? getAuth(calApp)
    : ({} as any);

export const calGoogleProvider =
  typeof GoogleAuthProvider === 'function' ? new GoogleAuthProvider() : ({} as any);

export const CAL_MEMBER_EMAIL =
  (import.meta.env.VITE_CALENDAR_MEMBER_EMAIL as string) ||
  (import.meta.env.VITE_MEMBER_EMAIL as string) ||
  'members@cisa-cal.web.app';

export const CAL_OWNER_EMAIL = 'yilongwang05@gmail.com';
