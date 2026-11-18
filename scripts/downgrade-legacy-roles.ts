/**
 * One-time data step for cutting the Student and Community roles.
 *
 * Every /users doc whose role is still `operator` (Student) or `viewer`
 * (Community) is set to `manager` (Trainee) with `approved: false`. The app
 * already reads a legacy role as no role and shows the pending-approval
 * screen; after this the account is an ordinary pending Trainee that a
 * Full-timer can approve or remove from Settings. Nothing else on the doc is
 * touched. The planner lives in src/lib/legacyRoleDowngrade.ts so it is unit
 * tested without a Firestore dependency, and it is idempotent.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print what would change, do not write.
 *   npx tsx scripts/downgrade-legacy-roles.ts
 *
 *   # Apply the writes.
 *   npx tsx scripts/downgrade-legacy-roles.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { planLegacyRoleDowngrade } from '../src/lib/legacyRoleDowngrade';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const app = initializeApp({ projectId });
const db = getFirestore(app, databaseId);
const usersRef = db.collection('users');
const commit = process.argv.includes('--commit');

// Print the target loudly. firebase-applet-config.json defaults to "prod", so
// an unqualified run IS a production run; QA rehearsal must set
// FIRESTORE_DATABASE_ID=qa-db explicitly.
console.log('Target: projects/' + projectId + '/databases/' + databaseId);

async function main() {
  const snap = await usersRef.get();
  const plan = planLegacyRoleDowngrade(
    snap.docs.map((d) => ({ id: d.id, role: d.get('role'), approved: d.get('approved') })),
  );

  console.log(`Scanned ${snap.size} users; ${plan.length} carry a cut role.`);
  for (const row of plan) {
    console.log(`  ${row.id}: ${row.from} -> manager, approved: false`);
  }

  if (!commit) {
    console.log('Dry run. Re-run with --commit to apply.');
    return;
  }

  const batch = db.batch();
  for (const row of plan) {
    batch.update(usersRef.doc(row.id), { ...row.set, updatedAt: FieldValue.serverTimestamp() });
  }
  if (plan.length > 0) await batch.commit();
  console.log(`Updated ${plan.length} users.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
