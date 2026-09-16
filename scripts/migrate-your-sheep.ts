/**
 * Migrate the private Your sheep preferences onto the contacts (issue #1051).
 *
 * Your sheep used to live in each reader's private preferences
 * (`userPreferences/{uid}.personalContactIds`) — unreadable by anyone else,
 * which is exactly why "Cared for by" could not be rendered from it. This
 * migration writes every reader's existing picks onto the contacts they point
 * at, as the `carers` tie, recomputing the access list in the same write so
 * the tie is something the rules can see.
 *
 * The judgment lives in src/lib/yourSheepMigration.ts, a pure planner that
 * aggregates every reader per contact and returns one row per contact that
 * needs a write. Idempotent: a contact whose carers and access list already
 * match produces no row, so a re-run finishes a partial run rather than
 * restarting it. Contacts that no longer exist are skipped; nothing is lost.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print the rows, write nothing.
 *   npx tsx scripts/migrate-your-sheep.ts
 *
 *   # Rehearse against the QA database first.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/migrate-your-sheep.ts
 *
 *   # Apply in 400-doc batches.
 *   npx tsx scripts/migrate-your-sheep.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  planYourSheepMigration,
  type CarerMigrationRow,
  type SheepPrefDoc,
} from '../src/lib/yourSheepMigration';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const app = initializeApp({ projectId });
const db = getFirestore(app, databaseId);
const contactsRef = db.collection('contacts');
const commit = process.argv.includes('--commit');

// Print the target loudly. firebase-applet-config.json defaults to "prod", so
// an unqualified run IS a production run; QA rehearsal must set
// FIRESTORE_DATABASE_ID=qa-db explicitly.
console.log('Target: projects/' + projectId + '/databases/' + databaseId);

let totalScanned = 0;
let plan: CarerMigrationRow[] = [];

async function buildPlan() {
  const [prefsSnap, contactsSnap] = await Promise.all([
    db.collection('userPreferences').get(),
    contactsRef.get(),
  ]);
  totalScanned = contactsSnap.size;

  const prefs: SheepPrefDoc[] = prefsSnap.docs.map((d) => ({
    uid: d.id,
    personalContactIds: Array.isArray(d.get('personalContactIds')) ? d.get('personalContactIds') : [],
  }));
  const contacts = contactsSnap.docs.map((d) => ({
    id: d.id,
    createdBy: d.get('createdBy'),
    addedBy: d.get('addedBy'),
    owner: d.get('owner'),
    coCreators: d.get('coCreators'),
    founders: d.get('founders'),
    carers: d.get('carers'),
    visibleTo: d.get('visibleTo'),
  }));

  plan = planYourSheepMigration(prefs, contacts);
}

async function apply() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan) {
    try {
      const patch: Record<string, unknown> = { visibleTo: row.visibleToTo };
      if (row.addCarers.length > 0) {
        patch.carers = FieldValue.arrayUnion(...row.addCarers);
      }
      batch.update(contactsRef.doc(row.contactId), patch as object);
      ops += 1;
    } catch (err) {
      console.error('  x ' + row.contactId + ': ' + (err instanceof Error ? err.message : err));
      continue;
    }
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
}

async function main() {
  await buildPlan();

  const readers = plan.reduce((n, r) => n + r.addCarers.length, 0);
  console.log(
    '\nScanned ' + totalScanned + ' contacts; ' + plan.length + ' contact(s) need a write ' +
      '(' + readers + ' reader(s) to add as carers).',
  );
  if (plan.length === 0) {
    console.log('Nothing to do: every sheeped contact already carries its carers.');
  }

  if (!commit) {
    console.log('\nDry run - pass --commit to apply.');
    return;
  }

  console.log('\nApplying...');
  await apply();
  console.log('Done. Wrote ' + plan.length + ' contact(s).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });