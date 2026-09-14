/**
 * One-time migration: move attendance onto the Gathering (#958).
 *
 * Legacy: each Contact carries `attendance` (gatheringId -> true | absent | late).
 * Target: each Gathering carries `attendance: { present, absent }`, and the
 * attendance-taken stamps are retired. The legacy Contact maps stay as a
 * rollback mirror until --drop-legacy is passed after the compare passes.
 *
 * Usage:
 *   npx tsx scripts/migrate-attendance-to-gatherings.ts            # dry run
 *   npx tsx scripts/migrate-attendance-to-gatherings.ts --verify   # compare only
 *   npx tsx scripts/migrate-attendance-to-gatherings.ts --commit   # write
 *   npx tsx scripts/migrate-attendance-to-gatherings.ts --commit --drop-legacy
 */
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { planAttendanceMigration } from '../src/lib/attendanceMigration';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

if (admin.apps.length === 0) admin.initializeApp({ projectId });
const db = getFirestore(admin.app(), databaseId);

const commit = process.argv.includes('--commit');
const verify = process.argv.includes('--verify');
const dropLegacy = process.argv.includes('--drop-legacy');

async function load() {
  const [contactsSnap, eventsSnap] = await Promise.all([
    db.collection('contacts').get(),
    db.collection('events').get(),
  ]);
  return {
    contacts: contactsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    events: eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

async function main() {
  const { contacts, events } = await load();
  const plan = planAttendanceMigration(contacts as never, events as never);

  console.log(`Gatherings: ${events.length}`);
  console.log(`Records to write: ${plan.updates.length}`);
  console.log(`Stamps to clear: ${plan.stampedIds.length}`);
  console.log(`Contacts with a legacy map: ${plan.legacyContactIds.length}`);
  console.log(`Orphaned entries (Gathering gone): ${plan.orphaned.length}`);
  for (const o of plan.orphaned.slice(0, 20)) {
    console.log(`  contact ${o.contactId} -> gathering ${o.gatheringId}`);
  }

  if (verify) {
    const current = new Map(events.map((e) => [e.id, (e as { attendance?: unknown }).attendance]));
    let mismatches = 0;
    for (const row of plan.expected) {
      if (JSON.stringify(current.get(row.id)) !== JSON.stringify(row.attendance)) {
        mismatches += 1;
        if (mismatches <= 20) console.log(`  mismatch ${row.id}`);
      }
    }
    console.log(`Verify: ${mismatches} mismatch(es) across ${plan.expected.length} record(s)`);
    return;
  }

  if (commit === false) {
    console.log('Dry run. Re-run with --commit to write.');
    return;
  }

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const row of plan.updates) {
    batch.update(db.collection('events').doc(row.id), {
      attendance: row.attendance,
      attendanceTakenAt: admin.firestore.FieldValue.delete(),
      attendanceTakenBy: admin.firestore.FieldValue.delete(),
      attendanceTakenById: admin.firestore.FieldValue.delete(),
    });
    ops += 1;
    if (ops >= 400) await flush();
  }
  await flush();

  if (dropLegacy) {
    for (const id of plan.legacyContactIds) {
      batch.update(db.collection('contacts').doc(id), {
        attendance: admin.firestore.FieldValue.delete(),
      });
      ops += 1;
      if (ops >= 400) await flush();
    }
    await flush();
  }

  console.log(`Done. Wrote ${plan.updates.length} record(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
