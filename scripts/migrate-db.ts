/**
 * Copy all documents (and nested subcollections) from one named Firestore
 * database to another, preserving document IDs, timestamps, and reference
 * paths. Used for the one-time production database rename (ai-studio-… → prod),
 * which the managed `gcloud firestore import` cannot do because it rejects
 * string properties longer than 1500 bytes (the Board's `md` markdown).
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   SOURCE_DATABASE_ID=ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897 \
 *   DEST_DATABASE_ID=prod \
 *   npx tsx scripts/migrate-db.ts
 *
 * Defaults: source = firebase-applet-config.json's firestoreDatabaseId,
 * dest = prod. Idempotent — overwrites matching doc IDs in the destination.
 */

import admin from 'firebase-admin';
import {
  getFirestore,
  type CollectionReference,
  type DocumentData,
} from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const sourceDbId = process.env.SOURCE_DATABASE_ID || cfg.firestoreDatabaseId;
const destDbId = process.env.DEST_DATABASE_ID || 'prod';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const src = getFirestore(admin.app(), sourceDbId);
const dst = getFirestore(admin.app(), destDbId);

let totalCopied = 0;
let totalFailed = 0;

async function copyCollection(
  srcRef: CollectionReference<DocumentData>,
  dstRef: CollectionReference<DocumentData>,
  path: string,
) {
  const snap = await srcRef.get();
  let batch = dst.batch();
  let ops = 0;

  for (const docSnap of snap.docs) {
    try {
      batch.set(dstRef.doc(docSnap.id), docSnap.data());
      ops += 1;
      totalCopied += 1;
    } catch (err) {
      totalFailed += 1;
      console.error(`  ✗ ${path}/${docSnap.id}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (ops >= 400) {
      await batch.commit();
      batch = dst.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }

  for (const docSnap of snap.docs) {
    const subCollections = await docSnap.ref.listCollections();
    for (const sub of subCollections) {
      const subPath = `${path}/${docSnap.id}/${sub.id}`;
      await copyCollection(sub, dstRef.doc(docSnap.id).collection(sub.id), subPath);
    }
  }
}

async function migrate() {
  console.log(
    `Copying Firestore data (project=${projectId}, ${sourceDbId} → ${destDbId})…`,
  );

  const rootCollections = await src.listCollections();
  for (const col of rootCollections) {
    console.log(`  copying collection ${col.id}…`);
    await copyCollection(col, dst.collection(col.id), col.id);
  }

  console.log(`Done. Copied ${totalCopied} docs, ${totalFailed} failed.`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
