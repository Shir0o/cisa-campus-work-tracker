/**
 * One-time migration: promote each recurring series in the `events`
 * collection to its own `Rhythm` doc (issue #957 / ADR 0016), superseding
 * `scripts/backfill-gathering-series.ts` (#962's `parentEventId` stopgap).
 *
 * For each group of `events` sharing a `parentEventId` anchor (post-#962,
 * every recurring event has one — including a self-anchored single):
 *   1. Create a `Rhythm` doc: name/location from the anchor, roster = union
 *      of every member's roster, cadence inferred from the anchor's
 *      `recurrenceType`/`recurrenceDays`/`monthlyType`, termStart/termEnd
 *      from the earliest/latest occurrence date in the group.
 *   2. Stamp every member with `rhythmId` = the new Rhythm doc id.
 *   3. Drop `parentEventId`, `type`, `isRecurring`, `recurrence*` from every
 *      `events` doc (this issue also retires the kind taxonomy).
 *
 * A true one-off (no `parentEventId`, no children) is left untouched aside
 * from dropping `type`/`isRecurring`/`recurrence*`, which by definition it
 * doesn't have set meaningfully anyway.
 *
 * Usage (admin credential via gcloud ADC or a service-account key):
 *
 *   # Dry run — print a report, do not write.
 *   npx tsx scripts/migrate-rhythms.ts
 *
 *   # Apply the writes in 400-doc batches.
 *   npx tsx scripts/migrate-rhythms.ts --commit
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const databaseId =
  process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = getFirestore(admin.app(), databaseId);
const eventsRef = db.collection('events');
const rhythmsRef = db.collection('rhythms');

const commit = process.argv.includes('--commit');

interface RawEvent {
  id: string;
  name: string;
  date: string;
  location?: string;
  type?: string;
  isRecurring?: boolean;
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrenceDays?: number[];
  monthlyType?: 'same-day' | 'relative-day';
  parentEventId?: string;
  roster?: string[];
  createdById?: string;
}

interface PlannedRhythm {
  anchorId: string;
  name: string;
  location?: string;
  roster: string[];
  cadence: { type: 'weekly' | 'monthly'; days: number[]; monthlyType?: 'same-day' | 'relative-day' };
  termStart: string;
  termEnd: string;
  memberIds: string[];
  createdById: string;
}

function inferCadence(anchor: RawEvent, members: RawEvent[]): PlannedRhythm['cadence'] {
  if (anchor.recurrenceType === 'monthly') {
    const anchorDate = new Date(anchor.date);
    return { type: 'monthly', days: [anchorDate.getDay()], monthlyType: anchor.monthlyType ?? 'same-day' };
  }
  // Weekly (or daily/none-but-grouped, which we still model as weekly on the
  // observed weekdays — the cadence type this issue keeps is weekly/monthly only).
  const days = anchor.recurrenceDays && anchor.recurrenceDays.length > 0
    ? anchor.recurrenceDays
    : Array.from(new Set(members.map((m) => new Date(m.date).getDay())));
  return { type: 'weekly', days: days.sort((a, b) => a - b) };
}

function planRhythms(events: RawEvent[]): { plans: PlannedRhythm[]; untouchedOneOffIds: string[] } {
  const groups = new Map<string, RawEvent[]>();
  for (const e of events) {
    const key = e.parentEventId || e.id;
    const isSeries = !!e.parentEventId || events.some((o) => o.parentEventId === e.id);
    if (!isSeries) continue;
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }

  const plans: PlannedRhythm[] = [];
  for (const [anchorId, members] of groups) {
    const anchor = members.find((m) => m.id === anchorId) ?? members[0];
    const sorted = [...members].sort((a, b) => a.date.localeCompare(b.date));
    const roster = Array.from(new Set(members.flatMap((m) => m.roster ?? [])));
    plans.push({
      anchorId,
      name: anchor.name,
      location: anchor.location,
      roster,
      cadence: inferCadence(anchor, members),
      termStart: sorted[0].date,
      termEnd: sorted[sorted.length - 1].date,
      memberIds: members.map((m) => m.id),
      createdById: anchor.createdById || 'migration',
    });
  }

  const groupedIds = new Set(plans.flatMap((p) => p.memberIds));
  const untouchedOneOffIds = events.filter((e) => !groupedIds.has(e.id)).map((e) => e.id);
  return { plans, untouchedOneOffIds };
}

async function main() {
  const snap = await eventsRef.get();
  const events: RawEvent[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RawEvent, 'id'>) }));
  const { plans, untouchedOneOffIds } = planRhythms(events);

  console.log(
    `Scanned ${events.length} events; ${plans.length} Rhythm(s) to create covering ` +
      `${plans.reduce((n, p) => n + p.memberIds.length, 0)} occasions; ${untouchedOneOffIds.length} one-off(s) untouched aside from field cleanup.`,
  );

  if (!commit) {
    console.log('Dry run — pass --commit to apply. Plan:');
    for (const p of plans) {
      console.log(`  "${p.name}" — ${p.memberIds.length} occasions, ${p.termStart}..${p.termEnd}, roster ${p.roster.length}`);
    }
    return;
  }

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const p of plans) {
    const rhythmRef = rhythmsRef.doc();
    batch.set(rhythmRef, {
      name: p.name,
      cadence: p.cadence,
      location: p.location ?? null,
      roster: p.roster,
      termStart: p.termStart,
      termEnd: p.termEnd,
      createdAt: new Date().toISOString(),
      createdById: p.createdById,
    });
    ops += 1;
    if (ops >= 400) await flush();

    for (const id of p.memberIds) {
      batch.update(eventsRef.doc(id), {
        rhythmId: rhythmRef.id,
        parentEventId: admin.firestore.FieldValue.delete(),
        type: admin.firestore.FieldValue.delete(),
        isRecurring: admin.firestore.FieldValue.delete(),
        recurrenceType: admin.firestore.FieldValue.delete(),
        recurrenceCount: admin.firestore.FieldValue.delete(),
        recurrenceEndDate: admin.firestore.FieldValue.delete(),
        recurrenceDays: admin.firestore.FieldValue.delete(),
        monthlyType: admin.firestore.FieldValue.delete(),
      });
      ops += 1;
      if (ops >= 400) await flush();
    }
  }

  for (const id of untouchedOneOffIds) {
    batch.update(eventsRef.doc(id), {
      type: admin.firestore.FieldValue.delete(),
      isRecurring: admin.firestore.FieldValue.delete(),
      recurrenceType: admin.firestore.FieldValue.delete(),
      recurrenceCount: admin.firestore.FieldValue.delete(),
      recurrenceEndDate: admin.firestore.FieldValue.delete(),
      recurrenceDays: admin.firestore.FieldValue.delete(),
      monthlyType: admin.firestore.FieldValue.delete(),
    });
    ops += 1;
    if (ops >= 400) await flush();
  }

  await flush();
  console.log(`Done. Created ${plans.length} Rhythm(s), updated ${events.length} event doc(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
