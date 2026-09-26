/**
 * Move Full-timers Discussion out of the open thread collection.
 *
 * Team-scope messages used to live in `contacts/{contactId}/threads` with
 * `scope: "team"`. Every approved role lists that collection unfiltered, and a
 * list rule cannot drop single documents from a result, so those messages
 * reached operators, viewers and tied Trainees. They now live in
 * `contacts/{contactId}/teamThreads`, which only Full-timers can read. This
 * moves the ones written before that change, keeping each id so reply
 * `parentId` links survive.
 *
 * Run after the rules that add teamThreads have deployed:
 *   npx tsx scripts/migrate-team-threads.ts --dry-run
 *   npx tsx scripts/migrate-team-threads.ts --write
 *
 * Each move is one batch (copy + delete), so a re-run after a partial one is
 * safe: it finds only what is still left in `threads`.
 */

import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

const THREAD_PATH = /^(contacts\/[^/]+)\/threads\/([^/]+)$/;

/** The teamThreads path for a contact thread doc, or null for any other path. */
export function teamThreadPath(path: string): string | null {
  const match = path.match(THREAD_PATH);
  return match ? `${match[1]}/teamThreads/${match[2]}` : null;
}

export async function migrateTeamThreads(
  firestore: Firestore,
  { write, log = console.log }: { write: boolean; log?: (message: string) => void },
): Promise<{ moved: number; skipped: number }> {
  const snap = await firestore.collectionGroup('threads').where('scope', '==', 'team').get();
  let moved = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    const target = teamThreadPath(d.ref.path);
    if (!target) {
      log(`  ↷ ${d.ref.path}: not a contact thread, skipping`);
      skipped++;
      continue;
    }
    moved++;
    if (!write) {
      log(`  → ${d.ref.path} → ${target}`);
      continue;
    }
    const batch = firestore.batch();
    batch.set(firestore.doc(target), d.data());
    batch.delete(firestore.doc(d.ref.path));
    await batch.commit();
  }

  log(`\nDone. ${moved} team-scope messages ${write ? 'moved' : 'would move (dry-run, no writes)'}; ${skipped} skipped.`);
  return { moved, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const write = process.argv.includes('--write');
  if (dryRun === write) {
    console.error('Usage: npx tsx scripts/migrate-team-threads.ts [--dry-run | --write]');
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'sac-campus-hub';
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || 'prod';
  if (!getApps().length) initializeApp({ projectId });

  migrateTeamThreads(getFirestore(getApp(), firestoreDatabaseId), { write })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
