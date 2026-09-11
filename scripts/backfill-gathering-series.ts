/**
 * One-time backfill: recurring Gatherings in the `events` collection whose
 * `parentEventId` field is missing get grouped into series and stamped with
 * their series anchor ID.
 *
 * Issue #956 — recurring terms never grouped into a Rhythm because parentEventId
 * was never written at creation time. This script groups existing Gatherings
 * carrying isRecurring: true and no parentEventId by name + weekday, orders each
 * group by date, and stamps every member with the first member's id.
 *
 * The planner lives in src/lib/attendanceRoster.ts so it can be unit tested
 * without a Firestore dependency.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run — print CSV report, do not write.
 *   npx tsx scripts/backfill-gathering-series.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/backfill-gathering-series.ts --commit
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  planGatheringSeriesBackfill,
  type GatheringSeriesBackfillPlanRow,
} from '../src/lib/attendanceRoster';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = getFirestore(admin.app(), databaseId);
const eventsRef = db.collection('events');

const commit = process.argv.includes('--commit');

let totalScanned = 0;
let totalChanged = 0;
let totalFailed = 0;
let plan: GatheringSeriesBackfillPlanRow[] = [];

async function planBackfill() {
  const snap = await eventsRef.get();
  totalScanned = snap.size;
  const docs = snap.docs.map((d) => ({
    id: d.id,
    name: d.get('name') ?? '',
    date: d.get('date') ?? '',
    isRecurring: d.get('isRecurring'),
    parentEventId: d.get('parentEventId'),
  }));
  plan = planGatheringSeriesBackfill(docs);
}

async function applyBackfill() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan) {
    try {
      batch.update(eventsRef.doc(row.id), { parentEventId: row.parentEventId });
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
  console.log('id,parentEventId');
  for (const row of plan) {
    console.log(
      [row.id, row.parentEventId]
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
    `Scanned ${totalScanned} gatherings; ${plan.length} need parentEventId.`,
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
