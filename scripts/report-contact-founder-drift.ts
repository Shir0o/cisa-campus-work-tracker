/**
 * Read-only Gospel Partner founding-set drift report (issue #1049).
 *
 * A contact's `founders` list is written once at creation, from the pairing
 * that was live at that instant, and nothing ever stamps it again. Because the
 * founding set is derivable from the dated pairing history and the contact's
 * creation time, the stored list can be checked against that oracle: wherever
 * they disagree, this report names the contact for a Full-timer to read.
 *
 * It never writes. There is no --commit and no write path — a drift is a bug
 * to report, not a write to make (that is the structural guarantee #1039's
 * failure was about). Contacts that carry no `founders` field predate #1049
 * and are skipped: they are the migration's job, not this report's.
 *
 * The judgment lives in src/lib/contactFounderDrift.ts, a pure read-only
 * planner; this script only fetches the documents and prints the rows.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   npx tsx scripts/report-contact-founder-drift.ts
 *
 *   # Rehearse against the QA database first.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/report-contact-founder-drift.ts
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import {
  pairingsFromSettings,
  planContactFounderDrift,
} from '../src/lib/contactFounderDrift';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const app = initializeApp({ projectId });
const db = getFirestore(app, databaseId);
const contactsRef = db.collection('contacts');

// Print the target loudly. firebase-applet-config.json defaults to "prod", so
// an unqualified run IS a production run; QA rehearsal must set
// FIRESTORE_DATABASE_ID=qa-db explicitly.
console.log('Target: projects/' + projectId + '/databases/' + databaseId);
console.log('Read-only: this report never writes a founder to any contact.');

async function main() {
  const partnersSnap = await db.doc('settings/partners').get();
  if (!partnersSnap.exists) {
    throw new Error('settings/partners does not exist - nothing to judge founders against.');
  }
  const pairings = pairingsFromSettings(partnersSnap.data() ?? null);

  const snap = await contactsRef.get();
  const contacts = snap.docs.map((d) => ({
    id: d.id,
    createdBy: d.get('createdBy'),
    addedBy: d.get('addedBy'),
    founders: d.get('founders'),
    createdAt: d.get('createdAt'),
  }));

  const rows = planContactFounderDrift(contacts, pairings);
  const drift = rows.filter((r) => r.outcome === 'drift');
  const unverifiable = rows.filter((r) => r.outcome === 'unverifiable');

  console.log(
    '\nScanned ' + snap.size + ' contacts; ' + drift.length + ' drift row(s), ' +
      unverifiable.length + ' unverifiable.',
  );

  if (drift.length === 0) {
    console.log('No stored founders disagree with the pairing history.');
  } else {
    console.log('contactId,anchor,createdAt,stored,implied');
    for (const row of drift) {
      console.log(
        [row.contactId, row.anchor, row.createdAt, row.stored.join(' '), row.implied.join(' ')].join(','),
      );
    }
  }

  if (unverifiable.length > 0) {
    console.log('\nUnverifiable (no creator or no usable creation date):');
    for (const row of unverifiable) {
      console.log('  ' + row.contactId + ': ' + row.reason);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Drift report failed:', err);
    process.exit(1);
  });