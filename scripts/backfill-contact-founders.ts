/**
 * Re-runnable migration: give every existing contact its founders (issue #1050).
 *
 * Contacts created before #1049 carry no `founders` list, so the new model
 * describes only the people added after it shipped. This backfill derives each
 * pre-existing contact's founders from the pairing history at its creation time
 * and stamps them — the committed counterpart to the read-only drift report in
 * scripts/report-contact-founder-drift.ts.
 *
 * Most contacts classify cleanly from the dated pairing history read out of
 * `settings/partners`: inside a recorded pairing, the creator plus the partner;
 * outside any pairing, the creator alone. Contacts created in the LIVE term are
 * different — a mid-term re-pairing destroyed that term's earlier arrangement,
 * so the settings document cannot answer them. Those are resolved ONLY from the
 * pairing-start dates a Full-timer supplied in #1039's question pass, passed in
 * as a JSON file; a current-term contact the answers do not place is listed as
 * unresolved and never written, because a wrong founder is a permanent,
 * un-removable tie.
 *
 * The judgment lives in src/lib/contactFounderBackfill.ts, a pure planner; this
 * script only fetches the documents and applies the writes. Each write sets
 * `founders` and recomputes `visibleTo` from the surviving ties in the same
 * batch, so the access list and the founders it mirrors never disagree. A
 * contact that already carries `founders` is skipped, so re-running finishes a
 * partial run rather than restarting it.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Rehearse against the QA database first.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/backfill-contact-founders.ts
 *
 *   # The #1039 pairing-start answers, as [{ "members": ["x","z"],
 *   # "startDate": "2026-09-10" }].
 *   npx tsx scripts/backfill-contact-founders.ts --answers /path/to/answers.json
 *
 *   # Dry run - print the report, write nothing.
 *   npx tsx scripts/backfill-contact-founders.ts --answers /path/to/answers.json
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/backfill-contact-founders.ts --answers /path/to/answers.json --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  pairingsFromSettings,
} from '../src/lib/contactFounderDrift';
import { termKeyOf } from '../src/lib/contactPartnerStampRepair';
import {
  planContactFounderBackfill,
  type FounderBackfillPlan,
  type SuppliedPairing,
} from '../src/lib/contactFounderBackfill';

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
console.log('Live term: ' + termKeyOf(new Date()));

/** Read the --answers file (the #1039 pairing-start answers). Missing or empty
 *  is allowed: past-term contacts still classify; current-term contacts fall to
 *  unresolved and are listed rather than guessed. */
function readAnswers(): SuppliedPairing[] {
  const index = process.argv.indexOf('--answers');
  if (index < 0 || !process.argv[index + 1]) {
    return [];
  }
  const raw = JSON.parse(readFileSync(process.argv[index + 1], 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.pairings)) return raw.pairings;
  return [];
}

let totalScanned = 0;
let totalChanged = 0;
let totalFailed = 0;
let plan: FounderBackfillPlan = { rows: [], writes: [] };

async function planBackfill() {
  const partnersSnap = await db.doc('settings/partners').get();
  if (!partnersSnap.exists) {
    throw new Error('settings/partners does not exist - nothing to judge founders against.');
  }
  const pairings = pairingsFromSettings(partnersSnap.data() ?? null);
  const supplied = readAnswers();

  if (supplied.length === 0) {
    console.log(
      'No --answers supplied: every contact in the live term will be listed as unresolved.',
    );
  } else {
    console.log('Resolving the live term from ' + supplied.length + ' pairing-start answer(s).');
  }

  const snap = await contactsRef.get();
  totalScanned = snap.size;
  const docs = snap.docs.map((d) => ({
    id: d.id,
    createdBy: d.get('createdBy'),
    addedBy: d.get('addedBy'),
    coCreators: d.get('coCreators'),
    founders: d.get('founders'),
    visibleTo: d.get('visibleTo'),
    createdAt: d.get('createdAt'),
  }));

  plan = planContactFounderBackfill(docs, pairings, supplied);
}

async function applyBackfill() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan.writes) {
    try {
      // Founders and the access list that mirrors them move together, so they
      // can never be left disagreeing (#1044).
      batch.update(contactsRef.doc(row.id), {
        founders: row.foundersTo,
        visibleTo: row.visibleToTo,
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

const csv = (v: unknown) =>
  String(v).includes(',') ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

/** Ids and outcomes only - no names, emails or phone numbers. */
function printCsv() {
  console.log('contactId,anchor,createdAt,founders,outcome,reason');
  for (const row of plan.rows) {
    console.log(
      [row.contactId, row.anchor, row.createdAt, row.founders.join(' '), row.outcome, row.reason]
        .map(csv)
        .join(','),
    );
  }
}

async function main() {
  await planBackfill();

  const count = (outcome: string) => plan.rows.filter((r) => r.outcome === outcome).length;
  const unresolved = plan.rows.filter((r) => r.outcome === 'unresolved');
  console.log(
    '\nScanned ' + totalScanned + ' contacts; ' + plan.rows.length + ' reviewed: ' +
      count('resolved') + ' resolved, ' + count('unresolved') + ' unresolved.',
  );
  console.log(plan.writes.length + ' contact(s) need a write.');

  printCsv();

  if (unresolved.length > 0) {
    console.log(
      '\n' + unresolved.length + ' unresolved - listed for a person to decide, never guessed.',
    );
  }

  if (!commit) {
    console.log('\nDry run - pass --commit to stamp the founders.');
    return;
  }

  console.log('\nApplying...');
  await applyBackfill();
  console.log('Done. Changed ' + totalChanged + ' docs, ' + totalFailed + ' failed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Founders migration failed:', err);
    process.exit(1);
  });