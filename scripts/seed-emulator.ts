/**
 * Seed script for Firebase Local Emulator.
 *
 * Populates Auth emulator and Firestore emulator with the 4 default test users
 * (Full-timer, Trainee, Student, Community) and approved /users/{uid} documents.
 *
 * Usage:
 *   npx tsx scripts/seed-emulator.ts
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_CREDENTIALS } from '../e2e/helpers/auth-defaults.js';

// Route firebase-admin to local emulators
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'sac-campus-hub';
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const auth = admin.auth();
const db = getFirestore(admin.app(), firestoreDatabaseId);

const KEYS = ['fulltimer', 'trainee', 'student', 'community'] as const;

export async function seedEmulator() {
  console.log('Seeding Firebase Emulator Auth & Firestore...');

  for (const key of KEYS) {
    const { email, password, role, label } = DEFAULT_CREDENTIALS[key];

    let uid: string;
    try {
      const existingUser = await auth.getUserByEmail(email);
      uid = existingUser.uid;
    } catch {
      const newUser = await auth.createUser({
        email,
        password,
        displayName: label,
      });
      uid = newUser.uid;
    }

    // Seed approved /users/{uid} document
    await db.collection('users').doc(uid).set(
      {
        email,
        displayName: label,
        photoURL: '',
        role,
        approved: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(`  ✓ ${key.padEnd(10)} ${email.padEnd(24)} uid=${uid} role=${role}`);
  }

  // Seed initial sample gathering so gathering/attendance tests have data
  const sampleGatheringRef = db.collection('gatherings').doc('e2e-sample-gathering');
  await sampleGatheringRef.set({
    title: 'E2E Campus Gathering',
    type: 'large_group',
    dateTime: new Date().toISOString(),
    location: 'Campus Center',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('Emulator seeding complete.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedEmulator()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Emulator seed failed:', err);
      process.exit(1);
    });
}
