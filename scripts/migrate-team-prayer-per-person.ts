/**
 * One-time data step for §21: team prayer became per person.
 *
 * "On our hearts" now shows every prayer of a contact whose `teamPrayer` is
 * true, instead of every prayer whose own flag was not false. Each contact
 * whose old prayers were on the page gets `teamPrayer: true`; a contact with no
 * team prayers, one already on, and one the team removed are all left alone
 * (the removal is the team's decision; a re-run must never take anyone off).
 * Prayer documents are not touched, and the script only ever writes `true`.
 *
 * The planner lives in src/lib/teamPrayerMigration.ts so it is unit tested
 * without a Firestore dependency, and it is idempotent.
 *
 * `updatedAt` is written as an ISO string: contacts store it that way
 * everywhere, and packages/core/src/search.ts sorts on it — a Firestore
 * Timestamp would break that sort.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print what would change, do not write.
 *   npx tsx scripts/migrate-team-prayer-per-person.ts
 *
 *   # Apply the writes.
 *   npx tsx scripts/migrate-team-prayer-per-person.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { planTeamPrayerMigration } from '../src/lib/teamPrayerMigration';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const app = initializeApp({ projectId });
const db = getFirestore(app, databaseId);
const contactsRef = db.collection('contacts');
const prayersRef = db.collection('prayers');
const commit = process.argv.includes('--commit');

// Print the target loudly. firebase-applet-config.json defaults to "prod", so
// an unqualified run IS a production run; QA rehearsal must set
// FIRESTORE_DATABASE_ID=qa-db explicitly.
console.log('Target: projects/' + projectId + '/databases/' + databaseId);

async function main() {
  const [contactsSnap, prayersSnap] = await Promise.all([
    contactsRef.get(),
    prayersRef.get(),
  ]);
  const plan = planTeamPrayerMigration(
    contactsSnap.docs.map((d) => ({
      id: d.id,
      teamPrayer: d.get('teamPrayer'),
      prayerListRemoved: d.get('prayerListRemoved'),
    })),
    prayersSnap.docs.map((d) => ({
      contactId: d.get('contactId'),
      teamPrayer: d.get('teamPrayer'),
    })),
  );

  const on = plan.length;
  console.log(
    `Scanned ${contactsSnap.size} contacts and ${prayersSnap.size} prayers; ` +
      `${on} to put on team prayer, ` +
      `${contactsSnap.size - plan.length} unchanged.`,
  );
  for (const row of plan) {
    console.log(`  ${row.id}: teamPrayer -> true`);
  }

  if (!commit) {
    console.log('Dry run. Re-run with --commit to apply.');
    return;
  }

  // Firestore takes 500 writes per batch; chunk so a large roster still fits.
  let batch = db.batch();
  let pending = 0;
  for (const row of plan) {
    batch.update(contactsRef.doc(row.id), {
      teamPrayer: row.teamPrayer,
      // ISO string, like every other contacts write — a Timestamp here would
      // break packages/core/src/search.ts's sort.
      updatedAt: new Date().toISOString(),
    });
    pending += 1;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  console.log(`Updated ${plan.length} contacts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
