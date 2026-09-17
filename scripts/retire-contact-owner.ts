/**
 * Re-runnable migration: retire the contact caregiver field (issue #1053
 * follow-up).
 *
 * #1053 removed the caregiver from the code but shipped no migration, so the
 * stored documents still carry `owner`, and — the part that matters — their
 * `visibleTo` still holds whoever that caregiver was. The access list was
 * derived from the ties including the caregiver; nothing has recomputed it
 * since the tie stopped existing, so an ex-caregiver with no other tie still
 * passes the rules' read check. The rules cannot tell that the grant is stale:
 * the list honestly says they may read.
 *
 * This script deletes the field and recomputes the access list from the ties
 * that remain, in the same write. The judgment lives in
 * src/lib/contactOwnerRetirement.ts, a pure planner; this script only fetches
 * the documents and applies the writes.
 *
 * READ THE `losesAccess` COLUMN BEFORE COMMITTING. Those readers can open the
 * person today and will not afterwards. Under the model #1044 settled that is
 * correct — care is the carer tie now, and a caregiver who never took the
 * person into their sheep holds nothing — but it is a real change to who sees
 * whom, and the dry run is the moment to notice a name that surprises you.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Rehearse against the QA database first.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/retire-contact-owner.ts
 *
 *   # Dry run - print the report, write nothing.
 *   npx tsx scripts/retire-contact-owner.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/retire-contact-owner.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  planContactOwnerRetirement,
  type OwnerRetirementRow,
} from '../src/lib/contactOwnerRetirement';

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
let plan: OwnerRetirementRow[] = [];

async function planRetirement() {
  const snap = await contactsRef.get();
  totalScanned = snap.size;
  plan = planContactOwnerRetirement(
    snap.docs.map((d) => {
      const data = d.data();
      const contact: Record<string, unknown> = {
        id: d.id,
        createdBy: data.createdBy,
        addedBy: data.addedBy,
        coCreators: data.coCreators,
        founders: data.founders,
        carers: data.carers,
        visibleTo: data.visibleTo,
      };
      // `'owner' in contact` is how the planner sees a document that still
      // carries the field, so only copy the key across when it is really there.
      if ('owner' in data) contact.owner = data.owner;
      return contact as Parameters<typeof planContactOwnerRetirement>[0][number];
    }),
  );
}

async function applyRetirement() {
  let batch = db.batch();
  let ops = 0;
  for (const row of plan) {
    try {
      batch.update(contactsRef.doc(row.id), {
        owner: FieldValue.delete(),
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

function printCsv() {
  // Ids and uids only -- no names, emails or phone numbers.
  console.log('id,ownerDropped,visibleToFrom,visibleToTo,losesAccess,gainsAccess');
  for (const row of plan) {
    console.log(
      [
        row.id,
        row.ownerDropped ?? '',
        row.visibleToFrom.join('|'),
        row.visibleToTo.join('|'),
        row.losesAccess.join('|'),
        row.gainsAccess.join('|'),
      ]
        .map((v) => (String(v).includes(',') ? '"' + String(v).replace(/"/g, '""') + '"' : v))
        .join(','),
    );
  }
}

async function main() {
  await planRetirement();
  const losing = plan.filter((r) => r.losesAccess.length > 0);
  const gaining = plan.filter((r) => r.gainsAccess.length > 0);
  console.log(
    'Scanned ' + totalScanned + ' contacts; ' + plan.length + ' need a retirement write.',
  );
  console.log(
    '  ' + losing.length + ' contacts drop a reader who has no other tie (read these).',
  );
  console.log(
    '  ' + gaining.length + " contacts had an access list that a tie-writer never recomputed.",
  );

  if (!commit) {
    console.log('Dry run - pass --commit to apply.');
    printCsv();
    return;
  }

  console.log('Applying...');
  await applyRetirement();
  console.log('Done. Changed ' + totalChanged + ' docs, ' + totalFailed + ' failed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Retirement failed:', err);
    process.exit(1);
  });
