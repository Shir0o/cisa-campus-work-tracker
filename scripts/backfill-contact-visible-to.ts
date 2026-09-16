/**
 * One-time backfill: stamp every contact's denormalised `visibleTo` access
 * list from its persisted ties (creator, adder, collaborators, founders, carers).
 *
 * Issue #1024 phase 4. The Firestore rules read `visibleTo` to enforce
 * contact visibility server-side, and the read rule must not tighten until
 * every existing contact carries the list.
 *
 * Mirroring ties is the whole job. The Gospel Partners reconciliation this
 * script used to do -- adding a Trainee's current-term partner to `coCreators`
 * on every contact that Trainee had ever anchored -- was removed in #1039: it
 * invented ties for terms before the pair existed. Use
 * scripts/repair-contact-partner-stamps.ts to take back the stamps it wrote.
 *
 * The planner lives in src/lib/contactVisibleToBackfill.ts so it is unit
 * tested without a Firestore dependency. It is idempotent: re-running after a
 * partial run finishes the job rather than restarting it.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print CSV report, do not write.
 *   npx tsx scripts/backfill-contact-visible-to.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/backfill-contact-visible-to.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  planContactVisibleToBackfill,
  type BackfillRow,
} from '../src/lib/contactVisibleToBackfill';

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
// FIRESTORE_DATABASE_ID=qa-db explicitly. The script only ever reads and writes
// the one database named here -- it never copies data between databases.
console.log('Target: projects/' + projectId + '/databases/' + databaseId);

let totalScanned = 0;
let totalChanged = 0;
let totalFailed = 0;
let plan: BackfillRow[] = [];

async function planBackfill() {
  const snap = await contactsRef.get();
  totalScanned = snap.size;
  const docs = snap.docs.map((d) => ({
    id: d.id,
    createdBy: d.get('createdBy'),
    addedBy: d.get('addedBy'),
    coCreators: d.get('coCreators'),
    visibleTo: d.get('visibleTo'),
  }));

  plan = planContactVisibleToBackfill(docs);
}

async function applyBackfill() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan) {
    try {
      batch.update(contactsRef.doc(row.id), { visibleTo: row.to });
      ops += 1;
      totalChanged += 1;
    } catch (err) {
      totalFailed += 1;
      console.error('  x ' + row.id + ': ' + (err instanceof Error ? err.message : err));
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

function printCsv() {
  console.log('id,visibleToFrom,visibleToTo');
  for (const row of plan) {
    console.log(
      [row.id, row.from.join('|'), row.to.join('|')]
        .map((v) => (String(v).includes(',') ? '"' + String(v).replace(/"/g, '""') + '"' : v))
        .join(','),
    );
  }
}

async function main() {
  await planBackfill();
  console.log('Scanned ' + totalScanned + ' contacts; ' + plan.length + ' need a visibleTo write.');

  if (!commit) {
    console.log('Dry run - pass --commit to apply.');
    printCsv();
    return;
  }

  console.log('Applying...');
  await applyBackfill();
  console.log('Done. Changed ' + totalChanged + ' docs, ' + totalFailed + ' failed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
