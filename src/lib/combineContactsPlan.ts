import type { Contact } from '../types';

// Pure combine-plan module (ADR 0038, issue #1427).
//
// The browser preview and the server endpoint both call `buildCombinePlan`, so
// it must stay free of the client Firebase SDK (enforced by
// src/test/serverImports.test.ts). Given the kept contact, the combined-in
// contact and a snapshot of the documents that reference the combined-in
// contact, it returns the field-level diff the Full-timer reviews and the
// exact list of documents to move and references to rewrite. Nothing here
// writes; the server applies the plan.

/** A detected duplicate pair. `kept` survives; `combinedIn` is absorbed. */
export interface CombinePair {
  kept: Contact;
  combinedIn: Contact;
  reason: string;
}

/** A subcollection document to move (interactions / threads / teamThreads). */
export interface SubcollectionDoc {
  id: string;
  data: Record<string, unknown>;
}

/** The documents that reference the combined-in contact, read before combining. */
export interface CombineReferences {
  interactions: SubcollectionDoc[];
  threads: SubcollectionDoc[];
  teamThreads: SubcollectionDoc[];
  prayers: { id: string; data: Record<string, unknown> }[];
  tasks: { id: string; data: Record<string, unknown> }[];
  visits: { id: string; contactIds: string[]; data?: Record<string, unknown> }[];
}

/** How one field's result was decided. */
export type CombineFieldKind = 'same' | 'kept' | 'filled-in' | 'merged' | 'notes-combined';

/** One row of the kept | combined-in | result diff. */
export interface CombineFieldRow {
  field: string;
  kind: CombineFieldKind;
  kept: string | string[];
  combinedIn: string | string[];
  result: string | string[];
  /** For `merged` rows, the members the combined-in contact adds. */
  added?: string[];
}

/** One item shown under a "What moves" group. */
export interface CombineMoveItem {
  id: string;
  label: string;
}

/** A group of documents that move or references that re-point. */
export interface CombineMoveGroup {
  kind: CombineMoveKind;
  count: number;
  items: CombineMoveItem[];
}

export type CombineMoveKind =
  | 'interactions'
  | 'threads'
  | 'teamThreads'
  | 'prayers'
  | 'tasks'
  | 'visits';

/** A document relocated from the combined-in contact to the kept contact. */
export interface MovedDocument {
  originalPath: string;
  newPath: string;
  originalData: Record<string, unknown>;
}

/** A stored reference rewritten from the combined-in id to the kept id. */
export interface RewrittenReference {
  collection: string;
  document: string;
  field: string;
  before: unknown;
  after: unknown;
}

/** The complete, executable combine plan. */
export interface CombinePlan {
  keptId: string;
  combinedInId: string;
  fieldRows: CombineFieldRow[];
  /** The merged profile written onto the kept contact. */
  keptData: Record<string, unknown>;
  moves: CombineMoveGroup[];
  movedDocuments: MovedDocument[];
  rewrittenReferences: RewrittenReference[];
}

// ── Matching (unchanged rules, ADR 0026 detection) ─────────────────────────

export function normalizeEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

export function normalizePhone(phone?: string | null): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

export function normalizeName(name?: string | null): string {
  return name ? name.trim().toLowerCase() : '';
}

/** Returns a human match reason when two contacts look like the same person. */
export function checkCombineMatch(a: Contact, b: Contact): string | null {
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (emailA && emailB && emailA === emailB) return 'Matching email';

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) return 'Matching phone';

  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  if (nameA && nameB && nameA === nameB) return 'Matching name';

  return null;
}

/**
 * Scans contacts for candidate duplicate pairs. Each contact is paired at most
 * once per pass, and the older record (by createdAt) is kept by default.
 */
export function findCombineCandidates(contacts: Contact[]): CombinePair[] {
  const pairs: CombinePair[] = [];
  const claimedIds = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    const a = contacts[i];
    if (!a?.id || claimedIds.has(a.id)) continue;

    for (let j = i + 1; j < contacts.length; j++) {
      const b = contacts[j];
      if (!b?.id || claimedIds.has(b.id)) continue;

      const reason = checkCombineMatch(a, b);
      if (!reason) continue;

      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      let kept = a;
      let combinedIn = b;
      const bIsOlder =
        timeB > 0 &&
        (timeA === 0 ||
          timeB < timeA);
      if (bIsOlder) {
        kept = b;
        combinedIn = a;
      }

      pairs.push({ kept, combinedIn, reason });
      claimedIds.add(a.id);
      claimedIds.add(b.id);
      break;
    }
  }

  return pairs;
}

// ── Field merge (unchanged merge rules, ADR 0026/0038) ─────────────────────

/** Scalar profile fields where the kept value wins and a gap is backfilled. */
export const COMBINE_SCALAR_FIELDS = [
  'location',
  'email',
  'phone',
  'stage',
  'spiritualBackground',
  'pronouns',
  'gender',
  'year',
  'major',
  'instagram',
  'howHeard',
  'metVia',
  'prayerRequest',
] as const;

/** Relationship sets merged as a union. */
export const COMBINE_SET_FIELDS = ['tags', 'founders', 'carers', 'coCreators', 'visibleTo'] as const;

/** Every profile field surfaced in the review, in display order. */
export const COMBINE_FIELD_ORDER = [
  'name',
  ...COMBINE_SCALAR_FIELDS,
  'notes',
  ...COMBINE_SET_FIELDS,
] as const;

/**
 * Combines profile attributes of the combined-in contact into the kept
 * contact: sets union, scalar values from the kept contact with gaps
 * backfilled, and non-empty notes joined with a divider.
 */
export function mergeContactProfiles(kept: Contact, combinedIn: Contact): Contact {
  const unionArray = (arrA?: string[] | null, arrB?: string[] | null): string[] => {
    const set = new Set<string>();
    (arrA ?? []).forEach((item) => item && set.add(item));
    (arrB ?? []).forEach((item) => item && set.add(item));
    return Array.from(set);
  };

  let combinedNotes = kept.notes?.trim() ?? '';
  const combinedInNotes = combinedIn.notes?.trim() ?? '';
  if (combinedInNotes) {
    if (combinedNotes && !combinedNotes.includes(combinedInNotes)) {
      combinedNotes = `${combinedNotes}\n\n--- Combined Notes ---\n\n${combinedInNotes}`;
    } else if (!combinedNotes) {
      combinedNotes = combinedInNotes;
    }
  }

  return {
    ...kept,
    name: kept.name,
    location: kept.location || combinedIn.location || '',
    email: kept.email || combinedIn.email || '',
    phone: kept.phone || combinedIn.phone || '',
    stage: kept.stage || combinedIn.stage || 'Lead',
    notes: combinedNotes,
    spiritualBackground: kept.spiritualBackground || combinedIn.spiritualBackground || '',
    pronouns: kept.pronouns || combinedIn.pronouns || '',
    gender: kept.gender || combinedIn.gender || '',
    year: kept.year || combinedIn.year || '',
    major: kept.major || combinedIn.major || '',
    instagram: kept.instagram || combinedIn.instagram || '',
    howHeard: kept.howHeard || combinedIn.howHeard || '',
    metVia: kept.metVia || combinedIn.metVia || '',
    prayerRequest: kept.prayerRequest || combinedIn.prayerRequest || '',
    tags: unionArray(kept.tags, combinedIn.tags),
    founders: unionArray(kept.founders, combinedIn.founders),
    carers: unionArray(kept.carers, combinedIn.carers),
    coCreators: unionArray(kept.coCreators, combinedIn.coCreators),
    visibleTo: unionArray(kept.visibleTo, combinedIn.visibleTo),
    // The combined-in contact's interactions move over, so its reach does too (#1335).
    reachedAt: kept.reachedAt || combinedIn.reachedAt,
  };
}

function scalarValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function listValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Lists one row per profile field: what the kept contact has, what the
 * combined-in contact has, and the result the Full-timer is about to commit.
 */
export function diffCombineFields(kept: Contact, combinedIn: Contact, merged: Contact): CombineFieldRow[] {
  const rows: CombineFieldRow[] = [];

  rows.push({
    field: 'name',
    kind: scalarValue(kept.name) === scalarValue(combinedIn.name) ? 'same' : 'kept',
    kept: scalarValue(kept.name),
    combinedIn: scalarValue(combinedIn.name),
    result: scalarValue(merged.name),
  });

  for (const field of COMBINE_SCALAR_FIELDS) {
    const keptValue = scalarValue(kept[field]);
    const combinedInValue = scalarValue(combinedIn[field]);
    let kind: CombineFieldKind;
    if (keptValue === combinedInValue) kind = 'same';
    else if (!keptValue && combinedInValue) kind = 'filled-in';
    else kind = 'kept';
    rows.push({
      field,
      kind,
      kept: keptValue,
      combinedIn: combinedInValue,
      result: scalarValue(merged[field]),
    });
  }

  const keptNotes = scalarValue(kept.notes).trim();
  const combinedInNotes = scalarValue(combinedIn.notes).trim();
  let notesKind: CombineFieldKind;
  if (keptNotes === combinedInNotes) notesKind = 'same';
  else if (!keptNotes && combinedInNotes) notesKind = 'filled-in';
  else if (keptNotes && combinedInNotes) notesKind = 'notes-combined';
  else notesKind = 'kept';
  rows.push({
    field: 'notes',
    kind: notesKind,
    kept: keptNotes,
    combinedIn: combinedInNotes,
    result: scalarValue(merged.notes),
  });

  for (const field of COMBINE_SET_FIELDS) {
    const keptList = listValue(kept[field]);
    const combinedInList = listValue(combinedIn[field]);
    const mergedList = listValue(merged[field]);
    const keptSet = new Set(keptList);
    const added = mergedList.filter((item) => !keptSet.has(item));
    const kind: CombineFieldKind = added.length > 0 ? 'merged' : 'same';
    rows.push({
      field,
      kind,
      kept: keptList,
      combinedIn: combinedInList,
      result: mergedList,
      ...(added.length > 0 ? { added } : {}),
    });
  }

  return rows;
}

// ── Plan ───────────────────────────────────────────────────────────────────

const SUBCOLLECTIONS = ['interactions', 'threads', 'teamThreads'] as const;

function itemLabel(data: Record<string, unknown>, fallback: string): string {
  const candidate =
    data.content ?? data.body ?? data.text ?? data.title ?? data.burden ?? data.date ?? data.name;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  return fallback;
}

/**
 * Builds the complete combine plan from the two contacts and a snapshot of
 * everything that references the combined-in contact. Pure: the server and
 * the browser preview run the same function.
 */
export function buildCombinePlan(
  kept: Contact,
  combinedIn: Contact,
  refs: CombineReferences,
  meta: { now: string; updatedById?: string; updatedByName: string },
): CombinePlan {
  const merged = mergeContactProfiles(kept, combinedIn);

  const keptData: Record<string, unknown> = {
    name: merged.name,
    location: merged.location,
    email: merged.email,
    phone: merged.phone,
    stage: merged.stage,
    notes: merged.notes,
    spiritualBackground: merged.spiritualBackground,
    pronouns: merged.pronouns,
    gender: merged.gender,
    year: merged.year,
    major: merged.major,
    instagram: merged.instagram,
    howHeard: merged.howHeard,
    metVia: merged.metVia,
    prayerRequest: merged.prayerRequest,
    tags: merged.tags,
    founders: merged.founders,
    carers: merged.carers,
    coCreators: merged.coCreators,
    visibleTo: merged.visibleTo,
    updatedAt: meta.now,
    updatedByName: meta.updatedByName,
  };
  if (meta.updatedById) keptData.updatedBy = meta.updatedById;
  if (merged.reachedAt) keptData.reachedAt = merged.reachedAt;

  const movedDocuments: MovedDocument[] = [];
  const moves: CombineMoveGroup[] = [];

  for (const sub of SUBCOLLECTIONS) {
    const docs = refs[sub];
    movedDocuments.push(
      ...docs.map((d) => ({
        originalPath: `contacts/${combinedIn.id}/${sub}/${d.id}`,
        newPath: `contacts/${kept.id}/${sub}/${d.id}`,
        originalData: d.data,
      })),
    );
    moves.push({
      kind: sub,
      count: docs.length,
      items: docs.map((d) => ({ id: d.id, label: itemLabel(d.data, d.id) })),
    });
  }

  const rewrittenReferences: RewrittenReference[] = [];

  for (const prayer of refs.prayers) {
    rewrittenReferences.push({
      collection: 'prayers',
      document: prayer.id,
      field: 'contactId',
      before: prayer.data.contactId ?? combinedIn.id,
      after: kept.id,
    });
  }
  moves.push({
    kind: 'prayers',
    count: refs.prayers.length,
    items: refs.prayers.map((p) => ({ id: p.id, label: itemLabel(p.data, p.id) })),
  });

  for (const task of refs.tasks) {
    rewrittenReferences.push({
      collection: 'tasks',
      document: task.id,
      field: 'contactId',
      before: task.data.contactId ?? combinedIn.id,
      after: kept.id,
    });
    // The cached contact name on a to-do is refreshed so it never shows the
    // retired spelling (ADR 0038).
    if (typeof task.data.contactName === 'string' && task.data.contactName !== kept.name) {
      rewrittenReferences.push({
        collection: 'tasks',
        document: task.id,
        field: 'contactName',
        before: task.data.contactName,
        after: kept.name,
      });
    }
  }
  moves.push({
    kind: 'tasks',
    count: refs.tasks.length,
    items: refs.tasks.map((t) => ({ id: t.id, label: itemLabel(t.data, t.id) })),
  });

  for (const visit of refs.visits) {
    const after = [...new Set(visit.contactIds.map((id) => (id === combinedIn.id ? kept.id : id)))];
    rewrittenReferences.push({
      collection: 'visits',
      document: visit.id,
      field: 'contactIds',
      before: visit.contactIds,
      after,
    });
  }
  moves.push({
    kind: 'visits',
    count: refs.visits.length,
    items: refs.visits.map((v) => ({ id: v.id, label: itemLabel(v.data ?? {}, v.id) })),
  });

  return {
    keptId: kept.id,
    combinedInId: combinedIn.id,
    fieldRows: diffCombineFields(kept, combinedIn, merged),
    keptData,
    moves,
    movedDocuments,
    rewrittenReferences,
  };
}

// ── Undo plan (issue #1429, ADR 0038) ──────────────────────────────────────
//
// Undo replays a combine in reverse but leaves work done since the combine
// alone. This pure function takes the stored combine record and a snapshot of
// the current database and returns both the three preview lists the Full-timer
// reviews and the exact writes the server applies. It never reads or writes.

/** The combine record fields undo needs. */
export interface CombineUndoRecord {
  keptId: string;
  combinedInId: string;
  keptBefore: Record<string, unknown>;
  combinedInBefore: Record<string, unknown>;
  keptAfter: Record<string, unknown>;
  movedDocuments: MovedDocument[];
  rewrittenReferences: RewrittenReference[];
}

/** Everything the undo plan reads from the current database. */
export interface CombineUndoCurrent {
  /** The kept contact as it is now. */
  kept: Record<string, unknown>;
  /** The kept contact's subcollection documents as they are now. */
  keptSubDocs: Record<'interactions' | 'threads' | 'teamThreads', SubcollectionDoc[]>;
  /** Current data at each moved document's new path, or null if it is gone. */
  movedCurrent: Record<string, Record<string, unknown> | null>;
  /** Current value of each rewritten reference, keyed by `referenceKey`. */
  referenceValues: Record<string, unknown>;
}

/** One entry in the Goes back / Stays preview lists. */
export interface CombineUndoItem {
  kind: string;
  id: string;
  label: string;
}

/** One entry in the Not restored preview list. */
export interface CombineUndoNotRestored {
  kind: 'field' | 'reference';
  label: string;
}

/** A field write on the kept contact: set `value`, or delete when `remove`. */
export interface CombineUndoKeptUpdate {
  field: string;
  value?: unknown;
  remove?: boolean;
}

/** The complete, executable undo plan. */
export interface CombineUndoPlan {
  goesBack: CombineUndoItem[];
  stays: CombineUndoItem[];
  notRestored: CombineUndoNotRestored[];
  keptUpdates: CombineUndoKeptUpdate[];
  movedBack: { originalPath: string; newPath: string; data: Record<string, unknown> }[];
  referenceReverts: {
    collection: string;
    document: string;
    field: string;
    value: unknown;
  }[];
}

/** The lookup key for a rewritten reference's current value. */
export function referenceKey(collection: string, document: string, field: string): string {
  return `${collection}/${document}/${field}`;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => valuesEqual(item, b[i]));
  }
  return false;
}

/** Fields the combine stamps as bookkeeping, not person data. */
const UNDO_META_FIELDS = new Set(['updatedAt', 'updatedByName', 'updatedBy']);

/**
 * Plans the undo of a combine from the record and the current database.
 * Moved documents return with their current data, references and kept-contact
 * fields revert only while they still hold what the combine wrote, and
 * documents or list items added since stay.
 */
export function buildCombineUndoPlan(
  record: CombineUndoRecord,
  current: CombineUndoCurrent,
): CombineUndoPlan {
  const goesBack: CombineUndoItem[] = [];
  const stays: CombineUndoItem[] = [];
  const notRestored: CombineUndoNotRestored[] = [];
  const keptUpdates: CombineUndoKeptUpdate[] = [];
  const movedBack: CombineUndoPlan['movedBack'] = [];
  const referenceReverts: CombineUndoPlan['referenceReverts'] = [];

  // Moved documents return to their original path with their current data, so
  // later edits come along. A moved document deleted since is left deleted.
  for (const moved of record.movedDocuments) {
    const parts = moved.originalPath.split('/');
    const kind = parts[2];
    const id = parts[3];
    const data = current.movedCurrent[moved.originalPath];
    if (data == null) continue;
    goesBack.push({ kind, id, label: itemLabel(data, id) });
    movedBack.push({ originalPath: moved.originalPath, newPath: moved.newPath, data });
  }

  // Documents created on the kept contact after the combine stay; they are the
  // kept-contact subcollection documents the combine did not move.
  for (const sub of SUBCOLLECTIONS) {
    const movedIds = new Set(
      record.movedDocuments
        .filter((m) => m.originalPath.split('/')[2] === sub)
        .map((m) => m.originalPath.split('/')[3]),
    );
    for (const doc of current.keptSubDocs[sub] ?? []) {
      if (movedIds.has(doc.id)) continue;
      stays.push({ kind: sub, id: doc.id, label: itemLabel(doc.data, doc.id) });
    }
  }

  // Kept-contact fields revert only while they still equal what the combine
  // wrote. Merged lists lose only the members the combine added.
  const setFields = new Set<string>(COMBINE_SET_FIELDS);
  for (const [field, afterValue] of Object.entries(record.keptAfter)) {
    const beforeValue = record.keptBefore[field];

    if (setFields.has(field)) {
      const beforeList = listValue(beforeValue);
      const afterList = listValue(afterValue);
      const added = afterList.filter((item) => !beforeList.includes(item));
      const currentList = listValue(current.kept[field]);
      const filtered = currentList.filter((item) => !added.includes(item));
      if (beforeValue === undefined) {
        // The combine introduced the list; drop it entirely when nothing later
        // was added, otherwise keep only the later additions.
        if (filtered.length === 0) keptUpdates.push({ field, remove: true });
        else keptUpdates.push({ field, value: filtered });
      } else if (!valuesEqual(filtered, currentList)) {
        keptUpdates.push({ field, value: filtered });
      }
      if (!valuesEqual(filtered, currentList)) {
        for (const item of currentList) {
          if (added.includes(item)) goesBack.push({ kind: 'field', id: field, label: `${field}: ${item}` });
        }
      }
      continue;
    }

    if (!valuesEqual(current.kept[field], afterValue)) {
      if (!UNDO_META_FIELDS.has(field)) notRestored.push({ kind: 'field', label: field });
      continue;
    }
    if (beforeValue === undefined) {
      keptUpdates.push({ field, remove: true });
    } else if (!valuesEqual(beforeValue, afterValue)) {
      keptUpdates.push({ field, value: beforeValue });
      if (!UNDO_META_FIELDS.has(field)) goesBack.push({ kind: 'field', id: field, label: field });
    }
  }

  // A rewritten reference reverts only while it still holds the combine value.
  for (const ref of record.rewrittenReferences) {
    const currentValue = current.referenceValues[referenceKey(ref.collection, ref.document, ref.field)];
    if (valuesEqual(currentValue, ref.after)) {
      referenceReverts.push({
        collection: ref.collection,
        document: ref.document,
        field: ref.field,
        value: ref.before,
      });
      goesBack.push({ kind: 'reference', id: `${ref.collection}/${ref.document}`, label: ref.field });
    } else {
      notRestored.push({ kind: 'reference', label: `${ref.collection}.${ref.field}` });
    }
  }

  return { goesBack, stays, notRestored, keptUpdates, movedBack, referenceReverts };
}
