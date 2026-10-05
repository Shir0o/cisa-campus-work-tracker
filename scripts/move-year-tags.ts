/**
 * One-off move of year tags into the `year` field (#1348).
 *
 * "Freshman", "Sophomore", "Junior", "Senior" and "Graduate" used to be
 * suggested tags, so a person's year lived in two places. `year` is now the
 * only place. For each contact with a tag naming one of those years
 * (case-insensitive): if `year` is empty it is set to the canonical-cased word
 * and the tag removed; if `year` is already set, the tag is just removed. Other
 * tags are left alone, and a second run changes nothing.
 *
 * A contact with no `year` whose tags name different years is skipped and
 * listed, for a person to settle by hand.
 *
 * The planner lives in src/lib/yearTagMove.ts so it is unit tested without a
 * Firestore dependency.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run (the default) - print the plan, do not write.
 *   npx tsx scripts/move-year-tags.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/move-year-tags.ts --commit
 *
 * firebase-applet-config.json defaults to the production database, so an
 * unqualified run targets production. Rehearse against QA with
 * FIRESTORE_DATABASE_ID=qa-db first.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { planYearTagMove, type YearTagMovePlan } from '../src/lib/yearTagMove';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const app = initializeApp({ projectId });
const db = getFirestore(app, databaseId);
const contactsRef = db.collection('contacts');
const commit = process.argv.includes('--commit');

// Print the target loudly, before anything is read.
console.log('==============================================================');
console.log('Target: projects/' + projectId + '/databases/' + databaseId);
console.log(commit ? 'Mode:   COMMIT - this WILL write to the database above' : 'Mode:   dry run - nothing will be written');
console.log('==============================================================');

let totalScanned = 0;
let totalChanged = 0;
let totalFailed = 0;
let plan: YearTagMovePlan = { rows: [], ambiguous: [] };

async function planMove() {
  const snap = await contactsRef.get();
  totalScanned = snap.size;
  plan = planYearTagMove(
    snap.docs.map((d) => ({ id: d.id, year: d.get('year'), tags: d.get('tags') })),
  );
}

async function applyMove() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan.rows) {
    try {
      batch.update(contactsRef.doc(row.id), {
        tags: row.tags,
        ...(row.year && { year: row.year }),
      });
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

function printReport() {
  const moves = plan.rows.filter((row) => row.year);
  console.log('id,setYear,removedTags');
  for (const row of plan.rows) {
    console.log([row.id, row.year ?? '', row.removed.join('|')].join(','));
  }
  console.log(
    moves.length + ' move a tag into year; ' + (plan.rows.length - moves.length) + ' only drop the tag.',
  );
  for (const skipped of plan.ambiguous) {
    console.log('SKIPPED (tags name different years, no year set): ' + skipped.id + ' [' + skipped.tags.join(', ') + ']');
  }
}

async function main() {
  await planMove();
  console.log('Scanned ' + totalScanned + ' contacts; ' + plan.rows.length + ' need a write; ' + plan.ambiguous.length + ' skipped as ambiguous.');
  printReport();

  if (!commit) {
    console.log('Dry run - pass --commit to apply.');
    return;
  }

  console.log('Applying...');
  await applyMove();
  console.log('Done. Changed ' + totalChanged + ' docs, ' + totalFailed + ' failed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Year tag move failed:', err);
    process.exit(1);
  });
