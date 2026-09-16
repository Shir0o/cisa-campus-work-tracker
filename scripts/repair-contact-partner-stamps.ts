/**
 * Re-runnable repair: take back the Gospel Partner `coCreators` stamps the
 * #1024 phase 4 backfill invented, and recompute `visibleTo` in the same write.
 *
 * Issue #1039. The backfill wrote each Trainee's CURRENT partner into
 * `coCreators` on every contact that Trainee had ever anchored, so a Trainee's
 * home cards their partner's people from terms before the two were ever paired.
 * The tie is real as far as the rules are concerned -- `visibleTo` honestly
 * mirrors it -- so the data is what has to change.
 *
 * The judgment lives in src/lib/contactPartnerStampRepair.ts, a pure planner
 * that sorts every stamp into remove / keep / ask. Only removals are written;
 * `ask` rows are questions to the person who arranged the pairs, grouped so one
 * answer settles many. The planner's doc comment explains why `settings/partners`
 * cannot be asked "were these two paired in this contact's term".
 *
 * Idempotent: a repaired contact no longer carries the stamp, so a re-run
 * finishes a partial run rather than restarting it.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print the report and the questions, write nothing.
 *   npx tsx scripts/repair-contact-partner-stamps.ts
 *
 *   # Rehearse against the QA database first.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/repair-contact-partner-stamps.ts
 *
 *   # Apply the removals in 400-doc batches.
 *   npx tsx scripts/repair-contact-partner-stamps.ts --commit
 *
 *   # Override the backfill's production run window (provenance flag only).
 *   BACKFILL_RUN_START=2026-09-15T00:00:00Z BACKFILL_RUN_END=2026-09-16T00:00:00Z \
 *     npx tsx scripts/repair-contact-partner-stamps.ts
 */

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  planContactPartnerStampRepair,
  termKeyOf,
  type RepairPlan,
} from '../src/lib/contactPartnerStampRepair';

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

// The window the backfill ran in production (PR #1035). Provenance only: it
// sharpens a human's reading of an `ask` row and never moves an outcome.
const runWindow = {
  start: process.env.BACKFILL_RUN_START || '2026-09-15T00:00:00.000Z',
  end: process.env.BACKFILL_RUN_END || '2026-09-16T00:00:00.000Z',
};

/** Normalise the stored settings/partners byTerm shape into groups. */
function normaliseByTerm(raw: Record<string, unknown> | undefined): Record<string, string[][]> {
  const out: Record<string, string[][]> = {};
  for (const [term, value] of Object.entries(raw || {})) {
    if (!Array.isArray(value)) continue;
    const groups: string[][] = [];
    for (const entry of value) {
      const members: unknown[] = Array.isArray(entry)
        ? entry
        : Array.isArray((entry as { members?: unknown[] })?.members)
          ? (entry as { members: unknown[] }).members
          : [];
      const clean = members.filter(
        (id, i, all): id is string =>
          typeof id === 'string' && id.length > 0 && all.indexOf(id) === i,
      );
      if (clean.length > 1) groups.push(clean);
    }
    out[term] = groups;
  }
  return out;
}

let totalScanned = 0;
let totalChanged = 0;
let totalFailed = 0;
let plan: RepairPlan = { rows: [], writes: [], askGroups: [] };

async function planRepair() {
  const partnersSnap = await db.doc('settings/partners').get();
  if (!partnersSnap.exists) {
    throw new Error('settings/partners does not exist - nothing to judge stamps against.');
  }
  const createTime = partnersSnap.createTime?.toDate().toISOString();
  const updateTime = partnersSnap.updateTime?.toDate().toISOString();
  if (!createTime || !updateTime) {
    throw new Error('settings/partners carries no createTime/updateTime metadata.');
  }
  const currentTerm = termKeyOf(new Date());

  // State the load-bearing evidence, so a reviewer can sanity-check the bound
  // rather than trust it. A deleted-and-recreated document moves createTime and
  // pushes more rows into `ask`.
  console.log('settings/partners createTime: ' + createTime + '  (before this -> remove)');
  console.log('settings/partners updateTime: ' + updateTime + '  (after this  -> keep)');
  console.log('Current term: ' + currentTerm);
  console.log('Backfill run window (provenance only): ' + runWindow.start + ' .. ' + runWindow.end);

  const snap = await contactsRef.get();
  totalScanned = snap.size;
  const docs = snap.docs.map((d) => ({
    id: d.id,
    createdBy: d.get('createdBy'),
    addedBy: d.get('addedBy'),
    coCreators: d.get('coCreators'),
    visibleTo: d.get('visibleTo'),
    createdAt: d.get('createdAt'),
    updatedAt: d.get('updatedAt'),
    updateTime: d.updateTime?.toDate().toISOString() ?? null,
  }));

  plan = planContactPartnerStampRepair(
    docs,
    { byTerm: normaliseByTerm(partnersSnap.data()?.byTerm), createTime, updateTime, currentTerm },
    runWindow,
  );
}

async function applyRepair() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan.writes) {
    try {
      // Both fields move by removal, not by absolute value: a collaborator
      // somebody added between the dry run and this commit then survives in
      // both lists rather than being erased from one of them (#1039 story 21).
      // The candidates are never the creator or adder, so dropping
      // the tie drops the only thing putting them on the access list -- which is
      // exactly row.visibleToTo when the document has not moved.
      batch.update(contactsRef.doc(row.id), {
        coCreators: FieldValue.arrayRemove(...row.removeCoCreators),
        visibleTo: FieldValue.arrayRemove(...row.removeCoCreators),
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
  console.log('contactId,term,anchor,candidate,outcome,reason,scriptWritten');
  for (const row of plan.rows) {
    console.log(
      [row.contactId, row.term, row.anchor, row.candidate, row.outcome, row.reason, row.scriptWritten]
        .map(csv)
        .join(','),
    );
  }
}

/** One question per pair — the answer collapses every row in the group. */
function printQuestions() {
  if (plan.askGroups.length === 0) {
    console.log('\nNo questions: every stamp was decided by machine.');
    return;
  }
  console.log('\nQuestions (' + plan.askGroups.length + ' pair(s)) - when were these two put together?');
  for (const group of plan.askGroups) {
    const when = group.from
      ? 'created ' + group.from.slice(0, 10) + ' .. ' + group.to.slice(0, 10)
      : 'no creation date recorded';
    console.log(
      '  ' + group.members.join(' + ') + ': ' + group.contactCount + ' contact(s) in doubt, ' + when,
    );
  }
}

async function main() {
  await planRepair();

  const count = (outcome: string) => plan.rows.filter((r) => r.outcome === outcome).length;
  console.log(
    '\nScanned ' + totalScanned + ' contacts; ' + plan.rows.length + ' partner stamp(s) reviewed: ' +
      count('remove') + ' remove, ' + count('keep') + ' keep, ' + count('ask') + ' ask.',
  );
  console.log(plan.writes.length + ' contact(s) need a write.');

  printCsv();
  printQuestions();

  if (!commit) {
    console.log('\nDry run - pass --commit to apply the removals.');
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
