/**
 * Migrate legacy contact comments into the single per-person thread collection.
 *
 * Old admin Comments lived in `contacts/{contactId}/comments` and were
 * Full-timer-only. The merged thread surface keeps that same audience by
 * writing them as `contacts/{contactId}/threads/{threadId}` with
 * `scope: "team"` — exactly what the Discussion tab reads today.
 *
 * Safe by default:
 *   npx tsx scripts/migrate-comments-to-threads.ts --dry-run
 *
 * Apply:
 *   npx tsx scripts/migrate-comments-to-threads.ts --write
 *
 * Reversible: this script only copies. It never deletes the old comments
 * subcollection, so removing the migrated thread docs (marked with
 * `legacyComment: true`) restores the previous state.
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');
const SHOULD_WRITE = process.argv.includes('--write');

if (!DRY_RUN && !SHOULD_WRITE) {
  console.error('Usage: npx tsx scripts/migrate-comments-to-threads.ts [--dry-run | --write]');
  process.exit(1);
}

if (DRY_RUN && SHOULD_WRITE) {
  console.error('Pick one mode: --dry-run or --write, not both.');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'sac-campus-hub';
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || 'prod';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = getFirestore(admin.app(), firestoreDatabaseId);

const toIso = (v: unknown): string => {
  if (!v) return new Date().toISOString();
  if (typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(String(v)).toISOString();
};

export async function migrateCommentsToThreads(firestore: Firestore): Promise<void> {
  const contactsSnap = await firestore.collection('contacts').get();
  let migratedCount = 0;
  let skippedCount = 0;

  console.log(`Scanning ${contactsSnap.size} contacts for legacy comments...`);

  for (const contact of contactsSnap.docs) {
    const commentsSnap = await contact.ref.collection('comments').get();
    if (commentsSnap.empty) continue;

    const threadsRef = contact.ref.collection('threads');
    const existingThreadIds = new Set(
      (await threadsRef.select().get()).docs.map((d) => d.id),
    );

    // Map old comment id -> new thread id so reply parentId links survive.
    const idMap = new Map<string, string>();
    for (const comment of commentsSnap.docs) {
      const candidate = comment.id;
      const newId = existingThreadIds.has(candidate) ? `legacy-${candidate}` : candidate;
      idMap.set(comment.id, newId);
    }

    for (const comment of commentsSnap.docs) {
      const data = comment.data();
      const newId = idMap.get(comment.id)!;
      const threadData: Record<string, unknown> = {
        from: data.userId || '',
        fromName: data.userName || 'Unknown',
        kind: 'comment',
        body: String(data.text || '').trim(),
        at: toIso(data.createdAt || data.date),
        reactions: [],
        interactionId: null,
        scope: 'team',
        legacyComment: true,
      };
      if (data.parentId) {
        threadData.parentId = idMap.get(String(data.parentId)) ?? null;
      }

      if (existingThreadIds.has(newId)) {
        console.log(`  ↷ ${contact.id}/${newId}: already exists, skipping`);
        skippedCount++;
        continue;
      }

      migratedCount++;
      if (SHOULD_WRITE) {
        await threadsRef.doc(newId).set(threadData);
      } else {
        console.log(`  → ${contact.id}/${newId}: ${threadData.body.slice(0, 60).replace(/\s+/g, ' ')}`);
      }
    }
  }

  console.log(`\nDone. ${migratedCount} legacy comments would be migrated${DRY_RUN ? ' (dry-run, no writes)' : ''}; ${skippedCount} already present.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateCommentsToThreads(db)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
