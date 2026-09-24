/**
 * One-time seed for the kind of person (#1152, ADR 0030).
 *
 * The kind — Local saint, Our own, Contact — is derived from two booleans a
 * Full-timer sets by hand. Starting from nothing would mean hundreds of manual
 * edits, so two signals already in the record seed it: the *Church Mtg* step
 * sets `inChurchLife`, and the retired free-text `role` ("Status" in the form)
 * sets `isStudent` where it names a student.
 *
 * It writes NO stamp. A stamp records that a person decided, and this script is
 * the app guessing — so everything it touches still counts as Not sorted yet,
 * and the Directory's unsorted filter stays an honest measure of work left.
 *
 * This is the ONLY place the stage is read for the kind. It is never a live
 * derivation: a stage is a position people are moved through, so a category
 * derived from it would flicker as a side effect of board housekeeping, and
 * `contact.stage` stores the stage's *label*, which an admin can rename out
 * from under it.
 *
 * The planner lives in src/lib/contactKindSeed.ts so it is unit tested without
 * a Firestore dependency. It is idempotent: re-running after a partial run
 * finishes the job rather than restarting it, and it never overrides a person
 * somebody has already sorted.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print CSV report, do not write.
 *   npx tsx scripts/backfill-contact-kind.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/backfill-contact-kind.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { planContactKindSeed, type KindSeedRow } from '../src/lib/contactKindSeed';

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
let totalChanged = 0;
let totalFailed = 0;
let plan: KindSeedRow[] = [];

async function planSeed() {
  const snap = await contactsRef.get();
  totalScanned = snap.size;
  plan = planContactKindSeed(
    snap.docs.map((d) => ({
      id: d.id,
      stage: d.get('stage'),
      role: d.get('role'),
      inChurchLife: d.get('inChurchLife'),
      isStudent: d.get('isStudent'),
      kindSetBy: d.get('kindSetBy'),
      kindSetAt: d.get('kindSetAt'),
    })),
  );
}

async function applySeed() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan) {
    try {
      batch.update(contactsRef.doc(row.id), row.set);
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
  console.log('id,inChurchLife,isStudent');
  for (const row of plan) {
    console.log([row.id, row.set.inChurchLife ?? '', row.set.isStudent ?? ''].join(','));
  }
}

async function main() {
  await planSeed();
  console.log('Scanned ' + totalScanned + ' contacts; ' + plan.length + ' need a kind write.');
  console.log('No stamp is written: every one of these stays Not sorted yet.');

  if (!commit) {
    console.log('Dry run - pass --commit to apply.');
    printCsv();
    return;
  }

  console.log('Applying...');
  await applySeed();
  console.log('Done. Changed ' + totalChanged + ' docs, ' + totalFailed + ' failed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Kind seed failed:', err);
    process.exit(1);
  });
