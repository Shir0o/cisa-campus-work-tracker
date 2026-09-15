/**
 * One-time backfill: stamp every contact's denormalised `visibleTo` access
 * list from its persisted ties (creator, adder, caregiver, collaborators).
 *
 * Issue #1024 phase 4. The Firestore rules read `visibleTo` to enforce
 * contact visibility server-side, and the read rule must not tighten until
 * every existing contact carries the list. The script also reconciles Gospel
 * Partners: contacts created by a Trainee whose current-term partner was never
 * stamped into `coCreators` get the partner added in the same write, so the
 * client's dynamic partner widening and the server's static ties agree.
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
 *
 *   # Override the term used for partner reconciliation (default: today).
 *   BACKFILL_TERM="Fall 2026" npx tsx scripts/backfill-contact-visible-to.ts
 */

import admin from 'firebase-admin';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  planContactVisibleToBackfill,
  type BackfillRow,
} from '../src/lib/contactVisibleToBackfill';

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

// Pure Gospel Partners lookups (mirrors packages/core/src/data/partners.ts).
const SEASON_BY_MONTH = [
  'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'fall', 'fall', 'fall', 'fall', 'fall',
];
const SEASON_LABELS: Record<string, string> = {
  spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter',
};

function currentTermKey(d = new Date()): string {
  const id = SEASON_BY_MONTH[d.getMonth()] ?? 'fall';
  return SEASON_LABELS[id] + ' ' + d.getFullYear();
}

/** Normalise the stored settings/partners byTerm shape into groups. */
function groupsForTerm(byTerm: Record<string, unknown> | undefined | null, term: string): string[][] {
  const raw = byTerm ? byTerm[term] : undefined;
  if (!Array.isArray(raw)) return [];
  const out: string[][] = [];
  for (const entry of raw) {
    let members: unknown[] = [];
    if (Array.isArray(entry)) {
      members = entry;
    } else if (entry && Array.isArray((entry as { members?: unknown[] }).members)) {
      members = (entry as { members: unknown[] }).members;
    }
    const clean = members.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (clean.length > 1) out.push(clean);
  }
  return out;
}

function partnerUidsOf(groups: string[][], uid: string): string[] {
  const group = groups.find((g) => g.includes(uid));
  return group ? group.filter((id) => id !== uid) : [];
}

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
    owner: d.get('owner'),
    coCreators: d.get('coCreators'),
    visibleTo: d.get('visibleTo'),
  }));

  const term = process.env.BACKFILL_TERM || currentTermKey();
  const partnersSnap = await db.doc('settings/partners').get();
  const byTerm = partnersSnap.data()?.byTerm as Record<string, unknown> | undefined;
  const groups = groupsForTerm(byTerm, term);
  console.log('Reconciling Gospel Partners for term: ' + term);

  plan = planContactVisibleToBackfill(docs, (uid) => partnerUidsOf(groups, uid));
}

async function applyBackfill() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan) {
    try {
      const patch: Record<string, unknown> = { visibleTo: row.to };
      if (row.addCoCreators.length > 0) {
        patch.coCreators = FieldValue.arrayUnion(...row.addCoCreators);
      }
      batch.update(contactsRef.doc(row.id), patch);
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
  console.log('id,visibleToFrom,visibleToTo,partnersAdded');
  for (const row of plan) {
    console.log(
      [row.id, row.from.join('|'), row.to.join('|'), row.addCoCreators.join('|')]
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
