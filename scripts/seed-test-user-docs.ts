/**
 * One-time seed: create approved /users/{uid} docs for the four real E2E test
 * users in the REAL Firestore, so they can pass the app's approval gate.
 *
 * The app's security rules (correctly) prevent users from self-approving, so
 * these docs must be written with admin privileges. This uses firebase-admin,
 * which needs a service-account credential:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx tsx scripts/seed-test-user-docs.ts
 *
 * It reads emails + roles from e2e/.test-credentials.json (gitignored), looks
 * up each user's UID by email, and writes an approved user doc. Idempotent.
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const creds = JSON.parse(readFileSync('e2e/.test-credentials.json', 'utf8')) as Record<
  string,
  { email: string; role: string; label: string }
>;

admin.initializeApp({ projectId: cfg.projectId });
const auth = admin.auth();
const db = getFirestore(admin.app(), cfg.firestoreDatabaseId);

const KEYS = ['fulltimer', 'trainee', 'student', 'community'] as const;

async function seed() {
  for (const key of KEYS) {
    const { email, role, label } = creds[key];
    const user = await auth.getUserByEmail(email);
    await db.collection('users').doc(user.uid).set(
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
    console.log(`  ✓ ${key.padEnd(10)} ${email.padEnd(24)} uid=${user.uid} role=${role} approved=true`);
  }
}

console.log('Seeding approved /users docs for E2E test users...');
seed()
  .then(() => { console.log('Done.'); process.exit(0); })
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
