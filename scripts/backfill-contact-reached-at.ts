/**
 * One-time backfill of the reach stamp (#1335).
 *
 * Every path that logs an interaction or marks someone present at a Gathering
 * now stamps the person `reachedAt`. A Full-timer's Directory and My Day read
 * only the team's 500 newest interactions, and lean on that stamp for anyone
 * reached before them — so people reached before the stamp existed need it
 * written once, or they keep reading Not reached yet.
 *
 * It reads every contact, every interaction (collection group) and every
 * Gathering, and stamps each reached person who has no stamp with the date of
 * their newest reach. Public sign-up is not reach and is never stamped. The
 * planner lives in src/lib/contactReachedAtBackfill.ts so it is unit tested
 * without Firestore. It is idempotent: a stamped person is never rewritten.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run - print the CSV plan, write nothing. Always run this first.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/backfill-contact-reached-at.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   FIRESTORE_DATABASE_ID=qa-db npx tsx scripts/backfill-contact-reached-at.ts --commit
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { planReachedAtBackfill } from '../src/lib/contactReachedAtBackfill';
import type { ReachGathering, ReachInteraction } from '../src/lib/reach';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const app = initializeApp({ projectId });
const db = getFirestore(app, databaseId);
const commit = process.argv.includes('--commit');

// Print the target loudly. firebase-applet-config.json defaults to "prod", so
// an unqualified run IS a production run; QA rehearsal must set
// FIRESTORE_DATABASE_ID=qa-db explicitly.
console.log('Target: projects/' + projectId + '/databases/' + databaseId);

/** An interaction's date, as the screens read it: when it happened, else when
 *  it was written. */
function interactionMs(data: DocumentData): number | null {
  for (const raw of [data.dateTime, data.createdAt]) {
    if (raw instanceof Timestamp) return raw.toMillis();
    if (typeof raw === 'string' && raw) {
      const ms = new Date(raw).getTime();
      if (!Number.isNaN(ms)) return ms;
    }
  }
  return null;
}

async function main() {
  const [contactsSnap, interactionsSnap, eventsSnap] = await Promise.all([
    db.collection('contacts').get(),
    db.collectionGroup('interactions').get(),
    db.collection('events').get(),
  ]);

  const interactions: ReachInteraction[] = [];
  let undatedInteractions = 0;
  for (const d of interactionsSnap.docs) {
    // Only interactions under a contact: contacts/{id}/interactions/{iid}.
    const parent = d.ref.parent.parent;
    if (!parent || parent.parent.id !== 'contacts') continue;
    const ms = interactionMs(d.data());
    if (ms == null) {
      undatedInteractions += 1;
      continue;
    }
    interactions.push({ contactId: parent.id, ms });
  }

  const plan = planReachedAtBackfill({
    contacts: contactsSnap.docs.map((d) => ({ id: d.id, reachedAt: d.get('reachedAt') ?? null })),
    interactions,
    gatherings: eventsSnap.docs.map((d) => d.data() as ReachGathering),
  });

  console.log(
    'Scanned ' + contactsSnap.size + ' contacts, ' + interactionsSnap.size + ' interactions, ' +
      eventsSnap.size + ' Gatherings; ' + plan.rows.length + ' need a reach stamp.',
  );
  if (undatedInteractions > 0) {
    console.log(undatedInteractions + ' interactions carry no readable date and were skipped.');
  }
  if (plan.undated.length > 0) {
    console.log('Reached but undatable, NOT stamped: ' + plan.undated.join(', '));
  }

  if (!commit) {
    console.log('Dry run - pass --commit to apply.');
    console.log('id,reachedAt');
    for (const row of plan.rows) console.log(row.id + ',' + row.set.reachedAt);
    return;
  }

  console.log('Applying...');
  let batch = db.batch();
  let ops = 0;
  let changed = 0;
  for (const row of plan.rows) {
    batch.update(db.collection('contacts').doc(row.id), row.set);
    ops += 1;
    changed += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log('Done. Stamped ' + changed + ' contacts.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Reach-stamp backfill failed:', err);
    process.exit(1);
  });
