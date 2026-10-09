/**
 * One-off repair: stamp `teamPrayer: false` on legacy off-page prayers so their
 * contacts stop reaching "On our hearts", without touching real prayer-page
 * prayers.
 *
 * Issue #1418. `isTeamPrayer` reads an ABSENT `teamPrayer` flag as the team's —
 * correct for prayer-page prayers written before the flag existed. But three
 * off-page write paths also left the flag off (the web contact Prayer tab until
 * #1062, and the web "Log a visit" prayer field / mobile contact-sheet Pray
 * sheet until #1406). The code fix that stops new off-page prayers is #1406;
 * this script repairs the rows already written.
 *
 * The judgment lives in src/lib/offPagePrayerRepair.ts, a pure planner that
 * sorts every prayer into write / skip / ask and records the matched signal per
 * row. Only unambiguous `write` rows are committed — and only ever the single
 * field `teamPrayer: false`. `ask` rows are questions for the maintainer and
 * are never written automatically.
 *
 * Idempotent: a repaired prayer now carries the flag, so a re-run's dry run
 * reports zero remaining candidates for the matched signals.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print the report and the questions, write nothing.
 *   npx tsx scripts/repair-off-page-prayers.ts
 *
 *   # Rehearse against the QA database first.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/repair-off-page-prayers.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/repair-off-page-prayers.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  ADD_PRAYER_ACTION,
  planOffPagePrayerRepair,
  type OffPagePrayerInput,
  type PrayerActivity,
  type PrayerRepairPlan,
  type PrayerRepairRow,
  type VisitPrayerLink,
} from '../src/lib/offPagePrayerRepair';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const app = initializeApp({ projectId });
const db = getFirestore(app, databaseId);
const prayersRef = db.collection('prayers');
const commit = process.argv.includes('--commit');

// Print the target loudly. firebase-applet-config.json defaults to "prod", so
// an unqualified run IS a production run; QA rehearsal must set
// FIRESTORE_DATABASE_ID=qa-db explicitly.
console.log('Target: projects/' + projectId + '/databases/' + databaseId);

let totalScanned = 0;
let totalChanged = 0;
let totalFailed = 0;
let plan: PrayerRepairPlan = { rows: [], writes: [], asks: [] };

async function planRepair() {
  const prayersSnap = await prayersRef.get();
  totalScanned = prayersSnap.size;
  const prayers: OffPagePrayerInput[] = prayersSnap.docs.map((d) => ({
    id: d.id,
    contactId: d.get('contactId'),
    teamPrayer: d.get('teamPrayer'),
    prayerPage: d.get('prayerPage'),
  }));

  // A visit names the prayer it produced by id; read them all so the planner
  // can join without an index. Only the two fields it reads are pulled.
  const visitsSnap = await db.collection('visits').get();
  const visits: VisitPrayerLink[] = visitsSnap.docs.map((d) => ({
    prayerId: d.get('prayerId'),
    prayerBurden: d.get('prayerBurden'),
  }));

  // The phone Pray sheet logs this action; the prayer page logs the same one.
  // The planner treats a match as corroboration only, never a write on its own.
  const activitiesSnap = await db
    .collection('activities')
    .where('action', '>=', ADD_PRAYER_ACTION)
    .where('action', '<=', ADD_PRAYER_ACTION + '\uf8ff')
    .get();
  const activities: PrayerActivity[] = activitiesSnap.docs.map((d) => ({
    action: d.get('action'),
    targetId: d.get('targetId'),
    targetType: d.get('targetType'),
  }));

  plan = planOffPagePrayerRepair(prayers, visits, activities);
}

async function applyRepair() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan.writes) {
    try {
      // The repair adds the single field teamPrayer: false. Nothing is deleted
      // and no other field is touched (#1418).
      batch.update(prayersRef.doc(row.id), { teamPrayer: false });
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

const csv = (v: unknown) =>
  String(v).includes(',') ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

/** Ids and signals only - no names, emails or phone numbers. */
function printCsv(rows: readonly PrayerRepairRow[]) {
  console.log('prayerId,contactId,signal,outcome,reason');
  for (const row of rows) {
    console.log([row.id, row.contactId, row.signal, row.outcome, row.reason].map(csv).join(','));
  }
}

function printQuestions() {
  if (plan.asks.length === 0) {
    console.log('\nNo questions: every prayer was decided by machine.');
    return;
  }
  console.log(
    '\nQuestions (' + plan.asks.length + ') - phone Pray sheet and prayer page look alike; decide each by hand:',
  );
  printCsv(plan.asks);
}

async function main() {
  await planRepair();

  const count = (outcome: string) => plan.rows.filter((r) => r.outcome === outcome).length;
  console.log(
    '\nScanned ' + totalScanned + ' prayers; ' + plan.rows.length + ' reviewed: ' +
      count('write') + ' write, ' + count('skip') + ' skip, ' + count('ask') + ' ask.',
  );
  console.log(plan.writes.length + ' prayer(s) need a write.');

  printCsv(plan.writes);
  printQuestions();

  if (!commit) {
    console.log('\nDry run - pass --commit to apply the writes.');
    return;
  }

  console.log('\nApplying...');
  await applyRepair();
  console.log('Done. Changed ' + totalChanged + ' docs, ' + totalFailed + ' failed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Repair failed:', err);
    process.exit(1);
  });
