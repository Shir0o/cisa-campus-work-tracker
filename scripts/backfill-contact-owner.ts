/**
 * One-time backfill: every contact in the `contacts` collection whose `owner`
 * field is missing or null gets `owner` set to `createdBy ?? addedBy ?? null`.
 *
 * Issue #685 — the contact detail page's "Cared for by" is bound to `owner`,
 * and contacts created before this change were never stamped with an `owner`.
 * This script fills the gap so the aside's display is meaningful for every
 * record in the system.
 *
 * The planner lives in src/lib/contactOwnerBackfill.ts so it can be unit
 * tested without a Firestore dependency. The script reads the same
 * `firebase-applet-config.json` that the rest of the tooling uses.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run — print CSV report, do not write.
 *   npx tsx scripts/backfill-contact-owner.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/backfill-contact-owner.ts --commit
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { planContactOwnerBackfill, type BackfillRow } from '../src/lib/contactOwnerBackfill';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = getFirestore(admin.app(), databaseId);
const contactsRef = db.collection('contacts');

const commit = process.argv.includes('--commit');

let totalScanned = 0;
let totalChanged = 0;
let totalFailed = 0;
let plan: BackfillRow[] = [];

async function planBackfill() {
  const snap = await contactsRef.get();
  totalScanned = snap.size;
  const docs = snap.docs.map((d) => ({
    id: d.id,
    owner: d.get('owner'),
    createdBy: d.get('createdBy'),
    addedBy: d.get('addedBy'),
  }));
  plan = planContactOwnerBackfill(docs);
}

async function applyBackfill() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan) {
    try {
      batch.update(contactsRef.doc(row.id), { owner: row.ownerTo });
      ops += 1;
      totalChanged += 1;
    } catch (err) {
      totalFailed += 1;
      console.error(
        `  ✗ ${row.id}: ${err instanceof Error ? err.message : err}`,
      );
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
  console.log('id,ownerFrom,ownerTo');
  for (const row of plan) {
    console.log(
      [row.id, row.ownerFrom ?? '', row.ownerTo ?? '']
        .map((v) =>
          String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : v,
        )
        .join(','),
    );
  }
}

async function main() {
  await planBackfill();
  console.log(
    `Scanned ${totalScanned} contacts; ${plan.length} need an owner.`,
  );

  if (!commit) {
    console.log('Dry run — pass --commit to apply.');
    printCsv();
    return;
  }

  console.log('Applying…');
  await applyBackfill();
  console.log(
    `Done. Changed ${totalChanged} docs, ${totalFailed} failed.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });