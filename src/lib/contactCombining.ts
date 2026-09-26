import type { Contact } from '../types';

export interface DuplicatePair {
  survivor: Contact;
  duplicate: Contact;
  reason: string;
}

/**
 * A single batched Firestore write prepared for a combine operation.
 * `collection` is a full collection path (e.g. `contacts/s1/interactions`).
 */
export type FirestoreOp =
  | { op: 'update'; collection: string; docId: string; data: Record<string, unknown> }
  | { op: 'set'; collection: string; docId: string; data: Record<string, unknown> }
  | { op: 'delete'; collection: string; docId: string };

/** A subcollection document to migrate (interactions / threads / teamThreads). */
export interface SubcollectionDoc {
  id: string;
  data: Record<string, unknown>;
}

/** Re-parentable external references gathered for a single pair. */
export interface CombineMigrationData {
  interactions: SubcollectionDoc[];
  threads: SubcollectionDoc[];
  teamThreads: SubcollectionDoc[];
  prayers: string[];
  tasks: string[];
  visits: { id: string; contactIds: string[] }[];
}

/** Number of writes Firestore allows in one batch. */
export const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Prepares the ordered set of batched writes that absorb `duplicate` into
 * `survivor` per ADR 0026:
 *  - updates the survivor profile with the merged fields,
 *  - copies interactions/threads/teamThreads subcollections to the survivor then deletes
 *    the originals under the duplicate,
 *  - re-parents prayers/tasks (by id) and rewrites visit contactIds,
 *  - deletes the duplicate contact record.
 */
export function buildCombineOps(
  survivor: Contact,
  duplicate: Contact,
  combined: Contact,
  now: string,
  updatedById: string | undefined,
  updatedByName: string,
  migration: CombineMigrationData = { interactions: [], threads: [], teamThreads: [], prayers: [], tasks: [], visits: [] }
): FirestoreOp[] {
  const ops: FirestoreOp[] = [];

  ops.push({
    op: 'update',
    collection: 'contacts',
    docId: survivor.id,
    data: {
      name: combined.name,
      role: combined.role,
      location: combined.location,
      email: combined.email,
      phone: combined.phone,
      stage: combined.stage,
      notes: combined.notes,
      spiritualBackground: combined.spiritualBackground,
      pronouns: combined.pronouns,
      gender: combined.gender,
      year: combined.year,
      major: combined.major,
      instagram: combined.instagram,
      howHeard: combined.howHeard,
      metVia: combined.metVia,
      prayerRequest: combined.prayerRequest,
      tags: combined.tags,
      founders: combined.founders,
      carers: combined.carers,
      coCreators: combined.coCreators,
      visibleTo: combined.visibleTo,
      updatedAt: now,
      updatedBy: updatedById,
      updatedByName,
    },
  });

  for (const interaction of migration.interactions) {
    ops.push({
      op: 'set',
      collection: `contacts/${survivor.id}/interactions`,
      docId: interaction.id,
      data: interaction.data,
    });
    ops.push({
      op: 'delete',
      collection: `contacts/${duplicate.id}/interactions`,
      docId: interaction.id,
    });
  }

  for (const [sub, docs] of [['threads', migration.threads], ['teamThreads', migration.teamThreads]] as const) {
    for (const thread of docs) {
      ops.push({
        op: 'set',
        collection: `contacts/${survivor.id}/${sub}`,
        docId: thread.id,
        data: thread.data,
      });
      ops.push({
        op: 'delete',
        collection: `contacts/${duplicate.id}/${sub}`,
        docId: thread.id,
      });
    }
  }

  for (const id of migration.prayers) {
    ops.push({ op: 'update', collection: 'prayers', docId: id, data: { contactId: survivor.id } });
  }

  for (const id of migration.tasks) {
    ops.push({ op: 'update', collection: 'tasks', docId: id, data: { contactId: survivor.id } });
  }

  for (const visit of migration.visits) {
    ops.push({
      op: 'update',
      collection: 'visits',
      docId: visit.id,
      data: { contactIds: visit.contactIds.map((id) => (id === duplicate.id ? survivor.id : id)) },
    });
  }

  ops.push({ op: 'delete', collection: 'contacts', docId: duplicate.id });

  return ops;
}

/** Splits prepared ops into batches that respect the Firestore write limit. */
export function chunkOps(ops: FirestoreOp[], size: number = FIRESTORE_BATCH_LIMIT): FirestoreOp[][] {
  const chunks: FirestoreOp[][] = [];
  for (let i = 0; i < ops.length; i += size) {
    chunks.push(ops.slice(i, i + size));
  }
  return chunks;
}

/**
 * Normalizes email for matching.
 */
export function normalizeEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

/**
 * Normalizes phone digits for matching.
 */
export function normalizePhone(phone?: string | null): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

/**
 * Normalizes full name for matching.
 */
export function normalizeName(name?: string | null): string {
  return name ? name.trim().toLowerCase() : '';
}

/**
 * Detects whether two contacts are potential duplicates.
 * Returns match reason or null.
 */
export function checkDuplicateMatch(a: Contact, b: Contact): string | null {
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (emailA && emailB && emailA === emailB) {
    return 'Matching email';
  }

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) {
    return 'Matching phone';
  }

  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  if (nameA && nameB && nameA === nameB) {
    return 'Matching name';
  }

  return null;
}

/**
 * Scans a list of contacts and finds duplicate candidate pairs.
 * Each contact is paired at most once per pass.
 * Defaults the older contact (by createdAt) as the survivor.
 */
export function findCandidateDuplicates(contacts: Contact[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const claimedIds = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    const a = contacts[i];
    if (!a?.id || claimedIds.has(a.id)) continue;

    for (let j = i + 1; j < contacts.length; j++) {
      const b = contacts[j];
      if (!b?.id || claimedIds.has(b.id)) continue;

      const reason = checkDuplicateMatch(a, b);
      if (reason) {
        // Determine older record
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

        let survivor = a;
        let duplicate = b;

        // If b is strictly older, b is survivor
        if (timeB > 0 && (timeA === 0 || timeB < timeA)) {
          survivor = b;
          duplicate = a;
        }

        pairs.push({ survivor, duplicate, reason });
        claimedIds.add(a.id);
        claimedIds.add(b.id);
        break;
      }
    }
  }

  return pairs;
}

/** How a field changes when a duplicate is absorbed into the survivor. */
export type FieldChangeKind = 'backfilled' | 'kept-survivor' | 'unioned' | 'notes-combined';

/** A single field-level change surfaced to the Full-timer before combining. */
export interface FieldChange {
  field: string;
  kind: FieldChangeKind;
  /** The merged value the survivor will end up with. */
  value: string | string[];
  /** For `kept-survivor` conflicts, the duplicate value that is dropped. */
  duplicateValue?: string;
  /** For `unioned` sets, the members added from the duplicate. */
  added?: string[];
}

/** Scalar profile fields merged in combineContactProfiles (excluding notes). */
const SCALAR_MERGE_FIELDS = [
  'role',
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

/** Relationship sets merged as a union in combineContactProfiles. */
const SET_MERGE_FIELDS = ['tags', 'founders', 'carers', 'coCreators', 'visibleTo'] as const;

/**
 * Lists the field-level changes a combine will make to the survivor, so a
 * reviewer sees exactly what is being merged before committing. Only fields
 * that actually change are reported:
 *  - `backfilled`: survivor was empty, the duplicate fills it.
 *  - `kept-survivor`: both have different values, the survivor's is kept and
 *    the duplicate's is dropped (the one case a reviewer must catch).
 *  - `unioned`: a relationship set gains members from the duplicate.
 *  - `notes-combined`: both records have notes, appended together.
 */
export function diffCombineChanges(survivor: Contact, duplicate: Contact, combined: Contact): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of SCALAR_MERGE_FIELDS) {
    const sv = survivor[field];
    const dup = duplicate[field];
    if (sv) {
      if (dup && dup !== sv) {
        changes.push({ field, kind: 'kept-survivor', value: sv, duplicateValue: dup });
      }
    } else if (dup) {
      changes.push({ field, kind: 'backfilled', value: combined[field] ?? dup });
    }
  }

  for (const field of SET_MERGE_FIELDS) {
    const svSet = new Set<string>(survivor[field] ?? []);
    const added = (combined[field] ?? []).filter((item) => !svSet.has(item));
    if (added.length > 0) {
      changes.push({ field, kind: 'unioned', value: combined[field] ?? [], added });
    }
  }

  const svNotes = (survivor.notes ?? '').trim();
  const dupNotes = (duplicate.notes ?? '').trim();
  if (svNotes && dupNotes && !svNotes.includes(dupNotes)) {
    changes.push({ field: 'notes', kind: 'notes-combined', value: combined.notes ?? '' });
  } else if (!svNotes && dupNotes) {
    changes.push({ field: 'notes', kind: 'backfilled', value: combined.notes ?? dupNotes });
  }

  return changes;
}

/**
 * Combines profile attributes of duplicate into survivor.
 * - Union sets for relationship ties (founders, carers, coCreators, visibleTo, tags)
 * - Retains survivor values, backfilling missing scalar fields from duplicate
 * - Concatenates non-empty notes
 */
export function combineContactProfiles(survivor: Contact, duplicate: Contact): Contact {
  const unionArray = (arrA?: string[] | null, arrB?: string[] | null): string[] => {
    const set = new Set<string>();
    (arrA ?? []).forEach((item) => item && set.add(item));
    (arrB ?? []).forEach((item) => item && set.add(item));
    return Array.from(set);
  };

  // Combine notes
  let combinedNotes = survivor.notes?.trim() ?? '';
  const duplicateNotes = duplicate.notes?.trim() ?? '';
  if (duplicateNotes) {
    if (combinedNotes && !combinedNotes.includes(duplicateNotes)) {
      combinedNotes = `${combinedNotes}\n\n--- Combined Notes ---\n\n${duplicateNotes}`;
    } else if (!combinedNotes) {
      combinedNotes = duplicateNotes;
    }
  }

  const combined: Contact = {
    ...survivor,
    role: survivor.role || duplicate.role || 'Student',
    location: survivor.location || duplicate.location || '',
    email: survivor.email || duplicate.email || '',
    phone: survivor.phone || duplicate.phone || '',
    stage: survivor.stage || duplicate.stage || 'Lead',
    notes: combinedNotes,
    spiritualBackground: survivor.spiritualBackground || duplicate.spiritualBackground || '',
    pronouns: survivor.pronouns || duplicate.pronouns || '',
    gender: survivor.gender || duplicate.gender || '',
    year: survivor.year || duplicate.year || '',
    major: survivor.major || duplicate.major || '',
    instagram: survivor.instagram || duplicate.instagram || '',
    howHeard: survivor.howHeard || duplicate.howHeard || '',
    metVia: survivor.metVia || duplicate.metVia || '',
    prayerRequest: survivor.prayerRequest || duplicate.prayerRequest || '',
    tags: unionArray(survivor.tags, duplicate.tags),
    founders: unionArray(survivor.founders, duplicate.founders),
    carers: unionArray(survivor.carers, duplicate.carers),
    coCreators: unionArray(survivor.coCreators, duplicate.coCreators),
    visibleTo: unionArray(survivor.visibleTo, duplicate.visibleTo),
  };

  return combined;
}
