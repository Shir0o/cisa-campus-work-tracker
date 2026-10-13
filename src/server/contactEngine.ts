import { FieldValue } from 'firebase-admin/firestore';
import {
  buildCombinePlan,
  buildCombineUndoPlan,
  combineRecordKind,
  referenceKey,
  timestampMillis,
  type CombineMoveGroup,
  type CombineReferences,
  type CombineUndoCurrent,
  type CombinePicks,
  type CombinePlan,
  type CombineUndoPlan,
  type CombineUndoItem,
  type CombineUndoNotRestored,
  type MovedDocument,
  type RewrittenReference,
} from '../lib/combineContactsPlan';
import type { Contact } from '../types';

export class ContactEngineError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ContactEngineError';
  }
}

export { ContactEngineError as CombineRefusal };

export const MAX_TRANSACTION_WRITES = 500;
export const COMBINE_CLAIM_TTL_MS = 10 * 60 * 1000;
export const BATCH_LIMIT = 400;

export interface ContactCombineEngineOptions {
  db: any;
}

interface QuerySnapshotLike {
  docs: Array<{ id: string; data(): Record<string, unknown> }>;
}

export interface ExpectedTimestamps {
  sourceUpdatedAt?: unknown;
  targetUpdatedAt?: unknown;
  combinedInUpdatedAt?: unknown;
  keptUpdatedAt?: unknown;
}

export interface PreviewCombineParams {
  sourceId?: string;
  targetId?: string;
  combinedInId?: string;
  keptId?: string;
  picks?: CombinePicks;
  expectedTimestamps?: ExpectedTimestamps;
  actorId?: string;
  actorName?: string;
}

export interface PreviewCombineResult {
  success: boolean;
  dryRun: boolean;
  moves: CombineMoveGroup[];
  plan: CombinePlan;
}

export interface ExecuteCombineParams {
  sourceId?: string;
  targetId?: string;
  combinedInId?: string;
  keptId?: string;
  expectedTimestamps?: ExpectedTimestamps;
  sourceUpdatedAt?: unknown;
  targetUpdatedAt?: unknown;
  combinedInUpdatedAt?: unknown;
  keptUpdatedAt?: unknown;
  picks?: CombinePicks;
  reason?: string;
  actorId?: string;
  actorName?: string;
}

export interface ExecuteCombineResult {
  success: boolean;
  combineRecordId: string;
  plan?: CombinePlan;
}

export interface PreviewUndoParams {
  combineRecordId: string;
  actorId?: string;
  actorName?: string;
}

export interface PreviewUndoResult {
  success: boolean;
  dryRun: boolean;
  preview: {
    goesBack: CombineUndoItem[];
    stays: CombineUndoItem[];
    notRestored: CombineUndoNotRestored[];
  };
  plan?: CombineUndoPlan;
}

export interface ExecuteUndoParams {
  combineRecordId: string;
  actorId?: string;
  actorName?: string;
}

export interface ExecuteUndoResult {
  success: boolean;
  preview: {
    goesBack: CombineUndoItem[];
    stays: CombineUndoItem[];
    notRestored: CombineUndoNotRestored[];
  };
}

export interface ContactCombineRecord {
  id?: string;
  kind: 'contacts';
  keptId: string;
  combinedInId: string;
  reason?: string;
  picks: CombinePicks;
  status: 'pending' | 'done' | 'undoing' | 'undone';
  keptBefore: Record<string, unknown>;
  combinedInBefore: Record<string, unknown>;
  keptAfter: Record<string, unknown>;
  movedDocuments: MovedDocument[];
  collidedDocuments: MovedDocument[];
  rewrittenReferences: RewrittenReference[];
  combinedBy: string;
  combinedByName: string;
  combinedAt: string;
  completedAt?: string;
  claimedAt?: string;
  undoneBy?: string;
  undoneByName?: string;
  undoneAt?: string;
}

export type CombineWriteOp =
  | { op: 'set'; ref: any; data: Record<string, unknown> }
  | { op: 'update'; ref: any; data: Record<string, unknown> }
  | { op: 'delete'; ref: any };

export function applyCombineWrite(writer: any, op: CombineWriteOp) {
  if (op.op === 'set') writer.set(op.ref, op.data);
  else if (op.op === 'update') writer.update(op.ref, op.data);
  else writer.delete(op.ref);
}

export async function commitInBatches(db: any, ops: CombineWriteOp[], limit: number = BATCH_LIMIT) {
  for (let i = 0; i < ops.length; i += limit) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + limit)) applyCombineWrite(batch, op);
    await batch.commit();
  }
}

/**
 * Inbox read-state is one map per axis per person. Write only the keys that
 * differ, as field paths, so a key the person marks meanwhile is not lost to a
 * stale copy of the whole map.
 */
export function mapKeyUpdates(field: string, from: unknown, to: unknown): Record<string, unknown> {
  const fromMap = (from ?? {}) as Record<string, unknown>;
  const toMap = (to ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(fromMap), ...Object.keys(toMap)])) {
    if (!(key in toMap)) updates[`${field}.${key}`] = FieldValue.delete();
    else if (!(key in fromMap) || fromMap[key] !== toMap[key]) updates[`${field}.${key}`] = toMap[key];
  }
  return updates;
}

export function isUndoClaimable(record: any): boolean {
  if (record.status === 'done') return true;
  if (record.status !== 'pending' && record.status !== 'undoing') return false;
  const claimedAt = Date.parse(record.claimedAt ?? record.combinedAt ?? '');
  return Number.isNaN(claimedAt) || Date.now() - claimedAt >= COMBINE_CLAIM_TTL_MS;
}

export function isContactCombineRecord(record: any): record is ContactCombineRecord {
  if (!record || typeof record !== 'object') return false;
  return combineRecordKind(record) === 'contacts';
}

export class ContactCombineEngine {
  private db: any;

  constructor(options: ContactCombineEngineOptions | any) {
    const db = options?.db ?? options;
    if (!db) {
      throw new Error('ContactCombineEngine requires a Firestore db instance');
    }
    this.db = db;
  }

  /**
   * Refuses while either contact is part of another pending or undoing combine record.
   */
  private async refuseInFlightCombine(reader: any, contactIds: string[], ownRecordId?: string) {
    const query = this.db.collection('combineRecords').where('status', 'in', ['pending', 'undoing']);
    const snap =
      typeof reader.get === 'function' && reader !== this.db
        ? await reader.get(query)
        : await query.get();
    const busy = snap.docs.find((d: any) => {
      const data = d.data();
      return (
        d.id !== ownRecordId &&
        (contactIds.includes(data.keptId) || contactIds.includes(data.combinedInId))
      );
    });
    if (busy) {
      throw new ContactEngineError(
        409,
        `One of these contacts is in another combine or undo that has not finished (${busy.id}). Wait for it to finish, or undo it if it was interrupted.`,
        { inFlightCombineId: busy.id },
      );
    }
  }

  /**
   * Reads references across nineteen distinct contact-dependent collections.
   */
  private async readReferences(combinedInId: string, keptId: string): Promise<CombineReferences> {
    const [
      interactionsSnap,
      threadsSnap,
      teamThreadsSnap,
      commentsSnap,
      prayersSnap,
      tasksSnap,
      visitsSnap,
      eventsSnap,
      rhythmsSnap,
      homesSnap,
      outreachSnap,
      aliasesSnap,
      importsSnap,
      prefsSnap,
      inboxSnap,
      notificationsSnap,
      activitiesSnap,
      usersSnap,
      keptInteractionsSnap,
      keptThreadsSnap,
      keptTeamThreadsSnap,
      keptCommentsSnap,
    ] = await Promise.all([
      this.db.collection('contacts').doc(combinedInId).collection('interactions').get(),
      this.db.collection('contacts').doc(combinedInId).collection('threads').get(),
      this.db.collection('contacts').doc(combinedInId).collection('teamThreads').get(),
      this.db.collection('contacts').doc(combinedInId).collection('comments').get(),
      this.db.collection('prayers').where('contactId', '==', combinedInId).get(),
      this.db.collection('tasks').where('contactId', '==', combinedInId).get(),
      this.db.collection('visits').where('contactIds', 'array-contains', combinedInId).get(),
      this.db.collection('events').get(),
      this.db.collection('rhythms').where('roster', 'array-contains', combinedInId).get(),
      this.db.collection('homes').where('members', 'array-contains', combinedInId).get(),
      this.db.collection('outreach').get(),
      this.db.collection('attendee_aliases').where('contactId', '==', combinedInId).get(),
      this.db.collection('pending_attendance_imports').get(),
      this.db.collection('userPreferences').get(),
      this.db.collection('inboxState').get(),
      this.db.collection('notifications').where('targetId', '==', combinedInId).get(),
      this.db.collection('activities').where('targetId', '==', combinedInId).get(),
      this.db.collection('users').get(),
      this.db.collection('contacts').doc(keptId).collection('interactions').get(),
      this.db.collection('contacts').doc(keptId).collection('threads').get(),
      this.db.collection('contacts').doc(keptId).collection('teamThreads').get(),
      this.db.collection('contacts').doc(keptId).collection('comments').get(),
    ]);

    const subDocs = (snap: QuerySnapshotLike) =>
      snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    const allDocs = (snap: QuerySnapshotLike) =>
      snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    const personalPrayers: CombineReferences['personalPrayers'] = [];
    await Promise.all(
      usersSnap.docs.map(async (user: any) => {
        const snap = await this.db
          .collection('users')
          .doc(user.id)
          .collection('personalPrayers')
          .get();
        for (const d of snap.docs) {
          personalPrayers.push({ id: d.id, userId: user.id, data: d.data() });
        }
      }),
    );

    return {
      interactions: subDocs(interactionsSnap),
      threads: subDocs(threadsSnap),
      teamThreads: subDocs(teamThreadsSnap),
      comments: subDocs(commentsSnap),
      prayers: allDocs(prayersSnap),
      tasks: allDocs(tasksSnap),
      visits: visitsSnap.docs.map((d: any) => ({
        id: d.id,
        contactIds: (d.data().contactIds ?? []) as string[],
        data: d.data(),
      })),
      gatherings: allDocs(eventsSnap),
      rhythms: allDocs(rhythmsSnap),
      homes: allDocs(homesSnap),
      outreach: allDocs(outreachSnap),
      attendeeAliases: allDocs(aliasesSnap),
      pendingImports: allDocs(importsSnap),
      personalPrayers,
      userPreferences: allDocs(prefsSnap),
      inboxStates: allDocs(inboxSnap),
      notifications: allDocs(notificationsSnap),
      activities: allDocs(activitiesSnap),
      keptSubDocIds: {
        interactions: keptInteractionsSnap.docs.map((d: any) => d.id),
        threads: keptThreadsSnap.docs.map((d: any) => d.id),
        teamThreads: keptTeamThreadsSnap.docs.map((d: any) => d.id),
        comments: keptCommentsSnap.docs.map((d: any) => d.id),
      },
    };
  }

  /**
   * Preview combine operations across all 19 collections without modifying database state.
   */
  async previewCombine(
    sourceIdOrParams: string | PreviewCombineParams,
    targetId?: string,
    options?: {
      picks?: CombinePicks;
      expectedTimestamps?: ExpectedTimestamps;
      actorId?: string;
      actorName?: string;
    },
  ): Promise<PreviewCombineResult> {
    const params: PreviewCombineParams =
      typeof sourceIdOrParams === 'object'
        ? sourceIdOrParams
        : {
            sourceId: sourceIdOrParams,
            targetId,
            picks: options?.picks,
            expectedTimestamps: options?.expectedTimestamps,
            actorId: options?.actorId,
            actorName: options?.actorName,
          };

    const combinedInId = (params.sourceId ?? params.combinedInId ?? '').trim();
    const keptId = (params.targetId ?? params.keptId ?? '').trim();

    if (!keptId || !combinedInId) {
      throw new ContactEngineError(400, 'keptId and combinedInId are required');
    }
    if (keptId === combinedInId) {
      throw new ContactEngineError(400, 'keptId and combinedInId must differ');
    }

    const [keptSnap, combinedInSnap] = await Promise.all([
      this.db.collection('contacts').doc(keptId).get(),
      this.db.collection('contacts').doc(combinedInId).get(),
    ]);

    if (!keptSnap.exists || !combinedInSnap.exists) {
      throw new ContactEngineError(404, 'One or both contacts were not found');
    }

    // Concurrency lock validation on timestamps
    const expectedTimestamps = params.expectedTimestamps;
    if (expectedTimestamps) {
      const expectedKept =
        expectedTimestamps.keptUpdatedAt !== undefined
          ? expectedTimestamps.keptUpdatedAt
          : expectedTimestamps.targetUpdatedAt;
      const expectedCombinedIn =
        expectedTimestamps.combinedInUpdatedAt !== undefined
          ? expectedTimestamps.combinedInUpdatedAt
          : expectedTimestamps.sourceUpdatedAt;

      if (expectedKept !== undefined || expectedCombinedIn !== undefined) {
        const currentKeptStamp = timestampMillis(keptSnap.data()?.updatedAt);
        const currentCombinedInStamp = timestampMillis(combinedInSnap.data()?.updatedAt);
        if (
          timestampMillis(expectedKept) !== currentKeptStamp ||
          timestampMillis(expectedCombinedIn) !== currentCombinedInStamp
        ) {
          throw new ContactEngineError(
            409,
            'One or both contacts changed since this preview was built. Rebuild the preview and try again.',
            { conflict: true },
          );
        }
      }
    }

    // In-flight combine verification
    await this.refuseInFlightCombine(this.db, [keptId, combinedInId]);

    const keptContact = { id: keptSnap.id, ...keptSnap.data() } as unknown as Contact;
    const combinedInContact = { id: combinedInSnap.id, ...combinedInSnap.data() } as unknown as Contact;

    const refs = await this.readReferences(combinedInId, keptId);
    const now = new Date().toISOString();
    const actorId = params.actorId ?? '';
    const actorName = params.actorName ?? '';

    const plan = buildCombinePlan(
      keptContact,
      combinedInContact,
      refs,
      { now, updatedById: actorId, updatedByName: actorName },
      params.picks ?? {},
    );

    return {
      success: true,
      dryRun: true,
      moves: plan.moves,
      plan,
    };
  }

  /**
   * Execute combine operations across 19 collections with optimistic locking and chunked batch commits.
   */
  async executeCombine(
    sourceIdOrParams: string | ExecuteCombineParams,
    targetId?: string,
    expectedTimestamps?: ExpectedTimestamps,
    options?: {
      picks?: CombinePicks;
      reason?: string;
      actorId?: string;
      actorName?: string;
    },
  ): Promise<ExecuteCombineResult> {
    const params: ExecuteCombineParams =
      typeof sourceIdOrParams === 'object'
        ? sourceIdOrParams
        : {
            sourceId: sourceIdOrParams,
            targetId,
            expectedTimestamps,
            picks: options?.picks,
            reason: options?.reason,
            actorId: options?.actorId ?? '',
            actorName: options?.actorName ?? '',
          };

    const combinedInId = (params.sourceId ?? params.combinedInId ?? '').trim();
    const keptId = (params.targetId ?? params.keptId ?? '').trim();

    if (!keptId || !combinedInId) {
      throw new ContactEngineError(400, 'keptId and combinedInId are required');
    }
    if (keptId === combinedInId) {
      throw new ContactEngineError(400, 'keptId and combinedInId must differ');
    }

    const timestamps = params.expectedTimestamps ?? {
      sourceUpdatedAt: params.sourceUpdatedAt,
      targetUpdatedAt: params.targetUpdatedAt,
      combinedInUpdatedAt: params.combinedInUpdatedAt,
      keptUpdatedAt: params.keptUpdatedAt,
    };

    const expectedKept =
      timestamps.keptUpdatedAt !== undefined
        ? timestamps.keptUpdatedAt
        : timestamps.targetUpdatedAt;
    const expectedCombinedIn =
      timestamps.combinedInUpdatedAt !== undefined
        ? timestamps.combinedInUpdatedAt
        : timestamps.sourceUpdatedAt;

    if (expectedKept === undefined || expectedCombinedIn === undefined) {
      throw new ContactEngineError(400, 'keptUpdatedAt and combinedInUpdatedAt are required');
    }

    const [keptSnap, combinedInSnap] = await Promise.all([
      this.db.collection('contacts').doc(keptId).get(),
      this.db.collection('contacts').doc(combinedInId).get(),
    ]);

    if (!keptSnap.exists || !combinedInSnap.exists) {
      throw new ContactEngineError(404, 'One or both contacts were not found');
    }

    const currentKeptStamp = timestampMillis(keptSnap.data()?.updatedAt);
    const currentCombinedInStamp = timestampMillis(combinedInSnap.data()?.updatedAt);
    if (
      timestampMillis(expectedKept) !== currentKeptStamp ||
      timestampMillis(expectedCombinedIn) !== currentCombinedInStamp
    ) {
      throw new ContactEngineError(
        409,
        'One or both contacts changed since this preview was built. Rebuild the preview and try again.',
        { conflict: true },
      );
    }

    const actorId = params.actorId ?? '';
    const actorName = params.actorName ?? '';
    const picks = params.picks ?? {};
    const reason = params.reason ?? '';

    const keptContact = { id: keptSnap.id, ...keptSnap.data() } as unknown as Contact;
    const combinedInContact = { id: combinedInSnap.id, ...combinedInSnap.data() } as unknown as Contact;

    const refs = await this.readReferences(combinedInId, keptId);
    const now = new Date().toISOString();

    const plan = buildCombinePlan(
      keptContact,
      combinedInContact,
      refs,
      { now, updatedById: actorId, updatedByName: actorName },
      picks,
    );

    const recordRef = this.db.collection('combineRecords').doc();
    plan.keptData.combinedFrom = {
      name: combinedInContact.name,
      at: now,
      byName: actorName,
      combineRecordId: recordRef.id,
    };

    const record: ContactCombineRecord = {
      kind: 'contacts',
      keptId,
      combinedInId,
      reason,
      picks,
      status: 'pending',
      keptBefore: { ...keptSnap.data() },
      combinedInBefore: { ...combinedInSnap.data() },
      keptAfter: plan.keptData,
      movedDocuments: plan.movedDocuments,
      collidedDocuments: plan.collidedDocuments,
      rewrittenReferences: plan.rewrittenReferences,
      combinedBy: actorId,
      combinedByName: actorName,
      combinedAt: now,
    };

    const ops: CombineWriteOp[] = [];
    ops.push({
      op: 'update',
      ref: this.db.collection('contacts').doc(keptId),
      data: plan.keptData,
    });

    for (const moved of plan.movedDocuments) {
      ops.push({
        op: 'set',
        ref: this.db
          .collection('contacts')
          .doc(keptId)
          .collection(moved.newPath.split('/')[2])
          .doc(moved.originalPath.split('/')[3]),
        data: moved.originalData,
      });
      ops.push({
        op: 'delete',
        ref: this.db
          .collection('contacts')
          .doc(combinedInId)
          .collection(moved.originalPath.split('/')[2])
          .doc(moved.originalPath.split('/')[3]),
      });
    }

    for (const collided of plan.collidedDocuments) {
      const parts = collided.originalPath.split('/');
      ops.push({
        op: 'delete',
        ref: this.db.collection('contacts').doc(combinedInId).collection(parts[2]).doc(parts[3]),
      });
    }

    const byDocument = new Map<
      string,
      { collection: string; document: string; data: Record<string, unknown> }
    >();
    for (const ref of plan.rewrittenReferences) {
      const key = `${ref.collection}/${ref.document}`;
      const fields =
        ref.collection === 'inboxState'
          ? mapKeyUpdates(ref.field, ref.before, ref.after)
          : { [ref.field]: ref.after };
      const entry = byDocument.get(key);
      if (entry) Object.assign(entry.data, fields);
      else
        byDocument.set(key, {
          collection: ref.collection,
          document: ref.document,
          data: { ...fields },
        });
    }
    for (const entry of byDocument.values()) {
      ops.push({
        op: 'update',
        ref: this.db.collection(entry.collection).doc(entry.document),
        data: entry.data,
      });
    }
    ops.push({ op: 'delete', ref: this.db.collection('contacts').doc(combinedInId) });

    const guard = async (tx: any) => {
      const [keptNow, combinedInNow] = await Promise.all([
        tx.get(this.db.collection('contacts').doc(keptId)),
        tx.get(this.db.collection('contacts').doc(combinedInId)),
      ]);
      if (
        !keptNow.exists ||
        !combinedInNow.exists ||
        timestampMillis(keptNow.data()?.updatedAt) !== timestampMillis(keptSnap.data()?.updatedAt) ||
        timestampMillis(combinedInNow.data()?.updatedAt) !==
          timestampMillis(combinedInSnap.data()?.updatedAt)
      ) {
        throw new ContactEngineError(
          409,
          'One or both contacts changed since this preview was built. Rebuild the preview and try again.',
          { conflict: true },
        );
      }
      await this.refuseInFlightCombine(tx, [keptId, combinedInId]);
    };

    if (ops.length < MAX_TRANSACTION_WRITES) {
      await this.db.runTransaction(async (tx: any) => {
        await guard(tx);
        for (const op of ops) applyCombineWrite(tx, op);
        tx.set(recordRef, { ...record, status: 'done', completedAt: new Date().toISOString() });
      });
    } else {
      await this.db.runTransaction(async (tx: any) => {
        await guard(tx);
        tx.set(recordRef, { ...record, status: 'pending', claimedAt: now });
      });
      await commitInBatches(this.db, ops);
      await recordRef.update({ status: 'done', completedAt: new Date().toISOString() });
    }

    await this.db.collection('activities').add({
      userId: actorId,
      userName: actorName,
      userPhoto: '',
      action: 'combined contact into',
      targetId: keptId,
      targetName: keptContact.name,
      targetType: 'contact',
      type: 'edit',
      description: `Combined "${combinedInContact.name}" (${combinedInId}) into "${keptContact.name}" (${keptId}).`,
      createdAt: now,
    });

    return { success: true, combineRecordId: recordRef.id, plan };
  }

  /**
   * Loads and validates a contact combine record.
   */
  private async loadContactRecord(combineRecordId: string) {
    if (!combineRecordId) {
      throw new ContactEngineError(400, 'combineRecordId is required');
    }
    const recordRef = this.db.collection('combineRecords').doc(combineRecordId);
    const recordSnap = await recordRef.get();
    if (!recordSnap.exists) {
      throw new ContactEngineError(404, 'Combine record not found');
    }
    const record = recordSnap.data() as any;
    if (!isContactCombineRecord(record)) {
      throw new ContactEngineError(400, 'Not a contact combine record');
    }
    if (record.status === 'undone') {
      throw new ContactEngineError(409, 'This combine has already been undone');
    }
    return { recordRef, record };
  }

  /**
   * Preview undo operations without modifying database state.
   */
  async previewUndo(
    combineRecordIdOrParams: string | PreviewUndoParams,
    _options?: { actorId?: string; actorName?: string },
  ): Promise<PreviewUndoResult> {
    const combineRecordId =
      typeof combineRecordIdOrParams === 'object'
        ? combineRecordIdOrParams.combineRecordId
        : combineRecordIdOrParams;

    const { record } = await this.loadContactRecord(combineRecordId);
    const keptId: string = record.keptId;
    const combinedInId: string = record.combinedInId;
    const keptBefore: Record<string, unknown> = record.keptBefore ?? {};
    const combinedInBefore: Record<string, unknown> = record.combinedInBefore ?? {};
    const movedDocuments: MovedDocument[] = Array.isArray(record.movedDocuments)
      ? record.movedDocuments
      : [];
    const collidedDocuments: MovedDocument[] = Array.isArray(record.collidedDocuments)
      ? record.collidedDocuments
      : [];
    const rewrittenReferences: RewrittenReference[] = Array.isArray(record.rewrittenReferences)
      ? record.rewrittenReferences
      : [];

    // Refuse while a later combine still has this kept contact combined in
    const laterCombinesSnap = await this.db
      .collection('combineRecords')
      .where('combinedInId', '==', keptId)
      .get();
    const laterCombine = laterCombinesSnap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .find((c: any) => c.status === 'done' && c.id !== combineRecordId);
    if (laterCombine) {
      const laterKeptId: string = laterCombine.keptId;
      const laterKeptName: string = laterCombine.keptBefore?.name || laterKeptId;
      throw new ContactEngineError(
        409,
        `"${keptBefore.name ?? keptId}" was later combined into "${laterKeptName}" (${laterKeptId}). Undo that combine (${laterCombine.id}) first.`,
        { laterCombineId: laterCombine.id, laterKeptId },
      );
    }

    const [keptSnap, interactionsSnap, threadsSnap, teamThreadsSnap, commentsSnap] =
      await Promise.all([
        this.db.collection('contacts').doc(keptId).get(),
        this.db.collection('contacts').doc(keptId).collection('interactions').get(),
        this.db.collection('contacts').doc(keptId).collection('threads').get(),
        this.db.collection('contacts').doc(keptId).collection('teamThreads').get(),
        this.db.collection('contacts').doc(keptId).collection('comments').get(),
      ]);

    const subDocs = (snap: QuerySnapshotLike) =>
      snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    const movedCurrent: CombineUndoCurrent['movedCurrent'] = {};
    await Promise.all(
      movedDocuments.map(async (moved) => {
        const parts = moved.newPath.split('/');
        const snap = await this.db
          .collection('contacts')
          .doc(parts[1])
          .collection(parts[2])
          .doc(parts[3])
          .get();
        movedCurrent[moved.originalPath] = snap.exists
          ? (snap.data() as Record<string, unknown>)
          : null;
      }),
    );

    const refDocs = new Map<string, Record<string, unknown> | null>();
    await Promise.all(
      rewrittenReferences.map(async (ref) => {
        const key = `${ref.collection}/${ref.document}`;
        if (refDocs.has(key)) return;
        const snap = await this.db.collection(ref.collection).doc(ref.document).get();
        refDocs.set(key, snap.exists ? (snap.data() as Record<string, unknown>) : null);
      }),
    );
    const referenceValues: Record<string, unknown> = {};
    for (const ref of rewrittenReferences) {
      const data = refDocs.get(`${ref.collection}/${ref.document}`);
      referenceValues[referenceKey(ref.collection, ref.document, ref.field)] = data
        ? data[ref.field]
        : undefined;
    }

    const plan = buildCombineUndoPlan(
      {
        keptId,
        combinedInId,
        keptBefore,
        combinedInBefore,
        keptAfter: (record.keptAfter ?? {}) as Record<string, unknown>,
        movedDocuments,
        collidedDocuments,
        rewrittenReferences,
      },
      {
        kept: (keptSnap.data() ?? {}) as Record<string, unknown>,
        keptSubDocs: {
          interactions: subDocs(interactionsSnap),
          threads: subDocs(threadsSnap),
          teamThreads: subDocs(teamThreadsSnap),
          comments: subDocs(commentsSnap),
        },
        movedCurrent,
        referenceValues,
      },
    );

    return {
      success: true,
      dryRun: true,
      preview: {
        goesBack: plan.goesBack,
        stays: plan.stays,
        notRestored: plan.notRestored,
      },
      plan,
    };
  }

  /**
   * Execute undo operations restoring all pointer references and contact states.
   */
  async executeUndo(
    combineRecordIdOrParams: string | ExecuteUndoParams,
    options?: { actorId?: string; actorName?: string },
  ): Promise<ExecuteUndoResult> {
    const params: ExecuteUndoParams =
      typeof combineRecordIdOrParams === 'object'
        ? combineRecordIdOrParams
        : {
            combineRecordId: combineRecordIdOrParams,
            actorId: options?.actorId ?? '',
            actorName: options?.actorName ?? '',
          };

    const combineRecordId = params.combineRecordId;
    const actorId = params.actorId ?? '';
    const actorName = params.actorName ?? '';

    const { recordRef, record } = await this.loadContactRecord(combineRecordId);
    const keptId: string = record.keptId;
    const combinedInId: string = record.combinedInId;
    const keptBefore: Record<string, unknown> = record.keptBefore ?? {};
    const combinedInBefore: Record<string, unknown> = record.combinedInBefore ?? {};
    const movedDocuments: MovedDocument[] = Array.isArray(record.movedDocuments)
      ? record.movedDocuments
      : [];
    const collidedDocuments: MovedDocument[] = Array.isArray(record.collidedDocuments)
      ? record.collidedDocuments
      : [];
    const rewrittenReferences: RewrittenReference[] = Array.isArray(record.rewrittenReferences)
      ? record.rewrittenReferences
      : [];

    const laterCombinesSnap = await this.db
      .collection('combineRecords')
      .where('combinedInId', '==', keptId)
      .get();
    const laterCombine = laterCombinesSnap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .find((c: any) => c.status === 'done' && c.id !== combineRecordId);
    if (laterCombine) {
      const laterKeptId: string = laterCombine.keptId;
      const laterKeptName: string = laterCombine.keptBefore?.name || laterKeptId;
      throw new ContactEngineError(
        409,
        `"${keptBefore.name ?? keptId}" was later combined into "${laterKeptName}" (${laterKeptId}). Undo that combine (${laterCombine.id}) first.`,
        { laterCombineId: laterCombine.id, laterKeptId },
      );
    }

    const [keptSnap, interactionsSnap, threadsSnap, teamThreadsSnap, commentsSnap] =
      await Promise.all([
        this.db.collection('contacts').doc(keptId).get(),
        this.db.collection('contacts').doc(keptId).collection('interactions').get(),
        this.db.collection('contacts').doc(keptId).collection('threads').get(),
        this.db.collection('contacts').doc(keptId).collection('teamThreads').get(),
        this.db.collection('contacts').doc(keptId).collection('comments').get(),
      ]);

    const subDocs = (snap: QuerySnapshotLike) =>
      snap.docs.map((d) => ({ id: d.id, data: d.data() }));

    const movedCurrent: CombineUndoCurrent['movedCurrent'] = {};
    await Promise.all(
      movedDocuments.map(async (moved) => {
        const parts = moved.newPath.split('/');
        const snap = await this.db
          .collection('contacts')
          .doc(parts[1])
          .collection(parts[2])
          .doc(parts[3])
          .get();
        movedCurrent[moved.originalPath] = snap.exists
          ? (snap.data() as Record<string, unknown>)
          : null;
      }),
    );

    const refDocs = new Map<string, Record<string, unknown> | null>();
    await Promise.all(
      rewrittenReferences.map(async (ref) => {
        const key = `${ref.collection}/${ref.document}`;
        if (refDocs.has(key)) return;
        const snap = await this.db.collection(ref.collection).doc(ref.document).get();
        refDocs.set(key, snap.exists ? (snap.data() as Record<string, unknown>) : null);
      }),
    );
    const referenceValues: Record<string, unknown> = {};
    for (const ref of rewrittenReferences) {
      const data = refDocs.get(`${ref.collection}/${ref.document}`);
      referenceValues[referenceKey(ref.collection, ref.document, ref.field)] = data
        ? data[ref.field]
        : undefined;
    }

    const plan = buildCombineUndoPlan(
      {
        keptId,
        combinedInId,
        keptBefore,
        combinedInBefore,
        keptAfter: (record.keptAfter ?? {}) as Record<string, unknown>,
        movedDocuments,
        collidedDocuments,
        rewrittenReferences,
      },
      {
        kept: (keptSnap.data() ?? {}) as Record<string, unknown>,
        keptSubDocs: {
          interactions: subDocs(interactionsSnap),
          threads: subDocs(threadsSnap),
          teamThreads: subDocs(teamThreadsSnap),
          comments: subDocs(commentsSnap),
        },
        movedCurrent,
        referenceValues,
      },
    );

    const now = new Date().toISOString();
    const ops: CombineWriteOp[] = [];

    if (plan.keptUpdates.length > 0) {
      const keptUpdate: Record<string, unknown> = {};
      for (const update of plan.keptUpdates) {
        keptUpdate[update.field] = update.remove ? FieldValue.delete() : update.value;
      }
      ops.push({ op: 'update', ref: this.db.collection('contacts').doc(keptId), data: keptUpdate });
    }

    ops.push({
      op: 'set',
      ref: this.db.collection('contacts').doc(combinedInId),
      data: combinedInBefore,
    });

    for (const moved of plan.movedBack) {
      const originalParts = moved.originalPath.split('/');
      const newParts = moved.newPath.split('/');
      ops.push({
        op: 'set',
        ref: this.db
          .collection('contacts')
          .doc(combinedInId)
          .collection(originalParts[2])
          .doc(originalParts[3]),
        data: moved.data,
      });
      ops.push({
        op: 'delete',
        ref: this.db.collection('contacts').doc(keptId).collection(newParts[2]).doc(newParts[3]),
      });
    }

    for (const collided of plan.recreated) {
      const parts = collided.originalPath.split('/');
      ops.push({
        op: 'set',
        ref: this.db.collection('contacts').doc(combinedInId).collection(parts[2]).doc(parts[3]),
        data: collided.data,
      });
    }

    const byDocument = new Map<
      string,
      { collection: string; document: string; data: Record<string, unknown> }
    >();
    for (const ref of plan.referenceRestores) {
      const key = `${ref.collection}/${ref.document}`;
      const fields =
        ref.collection === 'inboxState'
          ? mapKeyUpdates(ref.field, refDocs.get(key)?.[ref.field], ref.value)
          : { [ref.field]: ref.value };
      const entry = byDocument.get(key);
      if (entry) Object.assign(entry.data, fields);
      else
        byDocument.set(key, {
          collection: ref.collection,
          document: ref.document,
          data: { ...fields },
        });
    }
    for (const entry of byDocument.values()) {
      ops.push({
        op: 'update',
        ref: this.db.collection(entry.collection).doc(entry.document),
        data: entry.data,
      });
    }

    const claim = async (tx: any) => {
      const snap = await tx.get(recordRef);
      if (!snap.exists || !isUndoClaimable(snap.data())) {
        throw new ContactEngineError(
          409,
          'This combine has already been undone, or another undo of it is still running',
        );
      }
      await this.refuseInFlightCombine(tx, [keptId, combinedInId], combineRecordId);
    };

    const undoneState = {
      status: 'undone',
      undoneBy: actorId,
      undoneByName: actorName,
      undoneAt: now,
    };

    if (ops.length < MAX_TRANSACTION_WRITES) {
      await this.db.runTransaction(async (tx: any) => {
        await claim(tx);
        for (const op of ops) applyCombineWrite(tx, op);
        tx.update(recordRef, undoneState);
      });
    } else {
      await this.db.runTransaction(async (tx: any) => {
        await claim(tx);
        tx.update(recordRef, { status: 'undoing', claimedAt: now });
      });
      await commitInBatches(this.db, ops);
      await recordRef.update(undoneState);
    }

    await this.db.collection('activities').add({
      userId: actorId,
      userName: actorName,
      userPhoto: '',
      action: 'undid combine of',
      targetId: keptId,
      targetName: (keptBefore.name as string) ?? '',
      targetType: 'contact',
      type: 'edit',
      description: `Undid combine of "${combinedInBefore.name ?? combinedInId}" (${combinedInId}) into "${keptBefore.name ?? keptId}" (${keptId}).`,
      createdAt: now,
    });

    return {
      success: true,
      preview: {
        goesBack: plan.goesBack,
        stays: plan.stays,
        notRestored: plan.notRestored,
      },
    };
  }
}
