/**
 * One-time seed: create the Bible study **Study** and **Entry point** records
 * so a scan of `/s/cisa-wednesday` can resolve (issue #859, ADR 0011).
 *
 * Without these records nothing behind the entry point route exists — this
 * script is how ticket #859 is verifiable on its own, and how a Full-timer
 * starts a term without a code change.
 *
 * The security rules (correctly) deny client writes to these collections from
 * anything but a Full-timer account, so this runs with admin privileges:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx tsx scripts/seed-bible-study.ts
 *
 * Idempotent — safe to re-run. Existing `romans-fall26` Meeting documents are
 * test data baked into the old editor's component state; they are deleted
 * rather than adopted (issue #859).
 */

import { initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
initializeApp({ projectId: cfg.projectId });
const db = getFirestore(getApp(), cfg.firestoreDatabaseId);

const STUDY_ID = 'romans-fall26';
const ENTRY_POINT_SLUG = 'cisa-wednesday';

async function seed() {
  const stale = await db
    .collection('bible_study_meetings')
    .where('studyId', '==', STUDY_ID)
    .get();
  for (const doc of stale.docs) {
    await doc.ref.delete();
    console.log(`  - deleted stale Meeting ${doc.id}`);
  }

  await db
    .collection('bible_study_studies')
    .doc(STUDY_ID)
    .set(
      {
        title: 'Romans',
        term: 'Fall 2026',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  console.log(`  + Study ${STUDY_ID} — "Romans, Fall 2026"`);

  await db
    .collection('bible_study_entry_points')
    .doc(ENTRY_POINT_SLUG)
    .set(
      {
        slug: ENTRY_POINT_SLUG,
        name: 'Wednesday Bible Study',
        activeStudyId: STUDY_ID,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  console.log(`  + Entry point ${ENTRY_POINT_SLUG} -> ${STUDY_ID}`);
}

console.log('Seeding Bible study Study + Entry point...');
seed()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
