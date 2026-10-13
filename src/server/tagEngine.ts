import {
  normalizeTag,
  planTagApplies,
  planTagUndo,
  resolveStandardTags,
  type TagCombine,
  type TagUndoEntry,
  type TagPlanRow,
} from "../lib/tags";

export class TagEngineError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "TagEngineError";
  }
}

export const MAX_TRANSACTION_WRITES = 500;
export const COMBINE_CLAIM_TTL_MS = 10 * 60 * 1000;
export const BATCH_LIMIT = 400;

export interface TagCombineEngineOptions {
  db: any;
}

export interface CombineTagsParams {
  combines: TagCombine[];
  dryRun?: boolean;
  makeStandard?: string[];
  actorId: string;
  actorName: string;
  collections?: string[];
}

export interface CombineTagsResult {
  success: boolean;
  dryRun?: boolean;
  rows?: TagPlanRow[];
  combineRecordId?: string;
  changedCount?: number;
  logged?: number;
  multiCollectionChangedCount?: number;
}

export interface UndoCombineParams {
  combineRecordId: string;
  dryRun?: boolean;
  actorId: string;
  actorName: string;
}

export interface UndoCombineResult {
  success: boolean;
  dryRun?: boolean;
  preview: {
    restored: Array<{
      contactId: string;
      name: string;
      current: string[];
      before: string[];
    }>;
    skipped: Array<{
      contactId: string;
      name: string;
      current: string[];
      after: string[];
    }>;
    standardTagsRemaining: string[];
  };
  restoredCount: number;
  skippedCount: number;
}

export interface MultiCollectionDocRow {
  id: string;
  collection: string;
  name: string;
  from: string[];
  to: string[];
}

export function isUndoClaimable(record: any): boolean {
  if (record.status === "done") return true;
  if (record.status !== "pending" && record.status !== "undoing") return false;
  const claimedAt = Date.parse(record.claimedAt ?? record.combinedAt ?? "");
  return Number.isNaN(claimedAt) || Date.now() - claimedAt >= COMBINE_CLAIM_TTL_MS;
}

export class TagCombineEngine {
  private db: any;

  constructor(options: TagCombineEngineOptions) {
    if (!options?.db) {
      throw new Error("TagCombineEngine requires a Firestore db instance");
    }
    this.db = options.db;
  }

  /**
   * Queries documents with tags across specified collections (e.g. contacts, groups, activities).
   */
  async queryDocumentsWithTags(collectionNames: string[] = ["contacts"]): Promise<
    Array<{ id: string; collection: string; name: string; tags: string[] }>
  > {
    const results: Array<{ id: string; collection: string; name: string; tags: string[] }> = [];

    for (const col of collectionNames) {
      try {
        const snap = await this.db.collection(col).get();
        for (const doc of snap.docs) {
          const data = doc.data() ?? {};
          if (Array.isArray(data.tags)) {
            results.push({
              id: doc.id,
              collection: col,
              name: String(data.name ?? data.title ?? doc.id),
              tags: data.tags as string[],
            });
          }
        }
      } catch (err) {
        // If collection does not exist or query fails, skip gracefully
        console.warn(`[TagCombineEngine] Querying collection ${col} skipped:`, err);
      }
    }

    return results;
  }

  /**
   * Combines tags across documents, executing atomic batch writes, recording snapshots,
   * and optionally updating standard tags.
   */
  async combineTags(params: CombineTagsParams): Promise<CombineTagsResult> {
    const {
      combines,
      dryRun = false,
      makeStandard = [],
      actorId,
      actorName,
      collections = ["contacts"],
    } = params;

    if (!Array.isArray(combines) || combines.length === 0) {
      throw new TagEngineError(400, "combines are required");
    }

    // 1. Fetch contacts
    const contactsSnap = await this.db.collection("contacts").get();
    const contacts = contactsSnap.docs.map((d: any) => ({
      id: d.id,
      name: String(d.data().name ?? ""),
      tags: (d.data().tags ?? []) as string[],
    }));

    const rows = planTagApplies(contacts, combines);

    // 2. Fetch other collections if requested (e.g. groups, activities)
    const otherCollectionRows: MultiCollectionDocRow[] = [];
    const extraCols = collections.filter((c) => c !== "contacts");
    if (extraCols.length > 0) {
      for (const col of extraCols) {
        try {
          const colSnap = await this.db.collection(col).get();
          const docs = colSnap.docs
            .map((d: any) => ({
              id: d.id,
              name: String(d.data().name ?? d.data().title ?? d.id),
              tags: (d.data().tags ?? []) as string[],
            }))
            .filter((d: any) => Array.isArray(d.tags) && d.tags.length > 0);

          const colPlanned = planTagApplies(docs, combines);
          for (const planned of colPlanned) {
            otherCollectionRows.push({
              id: planned.contactId,
              collection: col,
              name: planned.name,
              from: planned.from,
              to: planned.to,
            });
          }
        } catch {
          // Skip missing collections
        }
      }
    }

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        rows,
        ...(otherCollectionRows.length > 0
          ? { multiCollectionChangedCount: otherCollectionRows.length }
          : {}),
      };
    }

    // 3. Resolve standard tags to add
    const targetNames = new Map<string, string>();
    for (const combine of combines) {
      const target = normalizeTag(combine.target);
      if (target) targetNames.set(target.toLowerCase(), target);
    }

    const standardRef = this.db.collection("settings").doc("standard_tags");
    const standardSnap = await standardRef.get();
    const standardTags = resolveStandardTags(
      standardSnap.exists ? ((standardSnap.data()?.tags ?? []) as string[]) : undefined,
    );
    const known = new Set(standardTags.map((tag) => tag.toLowerCase()));
    const standardTagsAdded: string[] = [];
    for (const name of makeStandard) {
      const target = targetNames.get(normalizeTag(name).toLowerCase());
      if (!target || known.has(target.toLowerCase())) continue;
      known.add(target.toLowerCase());
      standardTagsAdded.push(target);
    }

    const now = new Date().toISOString();
    const recordRef = this.db.collection("combineRecords").doc();

    // 4. Write combine snapshot record
    await recordRef.set({
      kind: "tags",
      combines,
      contacts: rows.map((row) => ({
        contactId: row.contactId,
        name: row.name,
        before: row.from,
        after: row.to,
      })),
      ...(otherCollectionRows.length > 0
        ? {
            documents: otherCollectionRows.map((row) => ({
              collection: row.collection,
              documentId: row.id,
              name: row.name,
              before: row.from,
              after: row.to,
            })),
          }
        : {}),
      standardTagsAdded,
      status: "pending",
      combinedBy: actorId,
      combinedByName: actorName,
      combinedAt: now,
    });

    // 5. Execute chunked atomic batch writes for contacts
    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const row of rows.slice(i, i + BATCH_LIMIT)) {
        batch.update(this.db.collection("contacts").doc(row.contactId), {
          tags: row.to,
          updatedAt: now,
          updatedBy: actorId,
          updatedByName: actorName,
        });
      }
      await batch.commit();
    }

    // 6. Execute chunked atomic batch writes for other collections
    for (let i = 0; i < otherCollectionRows.length; i += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const row of otherCollectionRows.slice(i, i + BATCH_LIMIT)) {
        batch.update(this.db.collection(row.collection).doc(row.id), {
          tags: row.to,
          updatedAt: now,
          updatedBy: actorId,
          updatedByName: actorName,
        });
      }
      await batch.commit();
    }

    // 7. Update standard tags if newly added
    if (standardTagsAdded.length > 0) {
      await standardRef.set({ tags: [...standardTags, ...standardTagsAdded] });
    }

    // 8. Log activities for contacts
    let logged = 0;
    for (const row of rows) {
      await this.db.collection("activities").add({
        userId: actorId,
        userName: actorName,
        userPhoto: "",
        action: "combined tags on",
        targetId: row.contactId,
        targetName: row.name,
        targetType: "contact",
        type: "edit",
        description: `Tags: [${row.from.join(", ")}] → [${row.to.join(", ")}]`,
        createdAt: now,
      });
      logged++;
    }

    // Log activities for other collections
    for (const row of otherCollectionRows) {
      await this.db.collection("activities").add({
        userId: actorId,
        userName: actorName,
        userPhoto: "",
        action: "combined tags on",
        targetId: row.id,
        targetName: row.name,
        targetType: row.collection,
        type: "edit",
        description: `Tags: [${row.from.join(", ")}] → [${row.to.join(", ")}]`,
        createdAt: now,
      });
      logged++;
    }

    // 9. Mark record done
    await recordRef.update({ status: "done", completedAt: new Date().toISOString() });

    return {
      success: true,
      combineRecordId: recordRef.id,
      changedCount: rows.length,
      logged,
      ...(otherCollectionRows.length > 0
        ? { multiCollectionChangedCount: otherCollectionRows.length }
        : {}),
    };
  }

  /**
   * Reverses a previous tag combine operation, restoring tags on documents
   * that haven't been modified since.
   */
  async undoCombine(params: UndoCombineParams): Promise<UndoCombineResult> {
    const { combineRecordId, dryRun = false, actorId, actorName } = params;

    if (!combineRecordId) {
      throw new TagEngineError(400, "combineRecordId is required");
    }

    const recordRef = this.db.collection("combineRecords").doc(combineRecordId);
    const recordSnap = await recordRef.get();
    if (!recordSnap.exists) {
      throw new TagEngineError(404, "Combine record not found");
    }

    const record = recordSnap.data();
    if (record.kind !== "tags") {
      throw new TagEngineError(400, "Not a tag combine record");
    }
    if (record.status === "undone") {
      throw new TagEngineError(409, "This combine has already been undone");
    }

    const entries: TagUndoEntry[] = (Array.isArray(record.contacts) ? record.contacts : [])
      .map((c: any) => ({
        contactId: String(c?.contactId ?? ""),
        name: String(c?.name ?? ""),
        before: Array.isArray(c?.before) ? c.before : [],
        after: Array.isArray(c?.after) ? c.after : [],
      }))
      .filter((entry: TagUndoEntry) => entry.contactId);

    const currentTagsByContact: Record<string, string[] | null> = {};
    for (const entry of entries) {
      const snap = await this.db.collection("contacts").doc(entry.contactId).get();
      currentTagsByContact[entry.contactId] = snap.exists
        ? ((snap.data()?.tags ?? []) as string[])
        : null;
    }

    const plan = planTagUndo(entries, currentTagsByContact);

    // Multi-collection documents if present
    const otherDocsEntries = (Array.isArray(record.documents) ? record.documents : []).map(
      (d: any) => ({
        collection: String(d.collection ?? ""),
        documentId: String(d.documentId ?? ""),
        name: String(d.name ?? ""),
        before: Array.isArray(d.before) ? d.before : [],
        after: Array.isArray(d.after) ? d.after : [],
      }),
    );

    const otherDocsRestore: typeof otherDocsEntries = [];
    for (const docEntry of otherDocsEntries) {
      if (!docEntry.collection || !docEntry.documentId) continue;
      const snap = await this.db.collection(docEntry.collection).doc(docEntry.documentId).get();
      if (!snap.exists) continue;
      const cur = ((snap.data()?.tags ?? []) as string[]).map((t) => t.trim());
      const unchanged =
        cur.length === docEntry.after.length &&
        cur.every((t, i) => t === docEntry.after[i]);
      if (unchanged) {
        otherDocsRestore.push(docEntry);
      }
    }

    const preview = {
      restored: plan.restore.map((row) => ({
        contactId: row.contactId,
        name: row.name,
        current: row.current,
        before: row.before,
      })),
      skipped: plan.skipped.map((row) => ({
        contactId: row.contactId,
        name: row.name,
        current: row.current,
        after: row.after,
      })),
      standardTagsRemaining: Array.isArray(record.standardTagsAdded)
        ? record.standardTagsAdded.filter((tag: any) => typeof tag === "string")
        : [],
    };

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        preview,
        restoredCount: plan.restore.length,
        skippedCount: plan.skipped.length,
      };
    }

    if (!isUndoClaimable(record)) {
      throw new TagEngineError(
        409,
        "This combine has already been undone, or another undo of it is still running",
      );
    }

    const now = new Date().toISOString();
    const ops: Array<{ ref: any; data: Record<string, unknown> }> = [
      ...plan.restore.map((row) => ({
        ref: this.db.collection("contacts").doc(row.contactId),
        data: { tags: row.before, updatedAt: now, updatedBy: actorId, updatedByName: actorName },
      })),
      ...otherDocsRestore.map((row) => ({
        ref: this.db.collection(row.collection).doc(row.documentId),
        data: { tags: row.before, updatedAt: now, updatedBy: actorId, updatedByName: actorName },
      })),
    ];

    const undoneState = {
      status: "undone",
      undoneBy: actorId,
      undoneByName: actorName,
      undoneAt: now,
    };

    if (ops.length < MAX_TRANSACTION_WRITES) {
      await this.db.runTransaction(async (tx: any) => {
        const snap = await tx.get(recordRef);
        if (!snap.exists || !isUndoClaimable(snap.data())) {
          throw new TagEngineError(
            409,
            "This combine has already been undone, or another undo of it is still running",
          );
        }
        for (const op of ops) {
          tx.update(op.ref, op.data);
        }
        tx.update(recordRef, undoneState);
      });
    } else {
      await this.db.runTransaction(async (tx: any) => {
        const snap = await tx.get(recordRef);
        if (!snap.exists || !isUndoClaimable(snap.data())) {
          throw new TagEngineError(
            409,
            "This combine has already been undone, or another undo of it is still running",
          );
        }
        tx.update(recordRef, { status: "undoing", claimedAt: now });
      });

      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = this.db.batch();
        for (const op of ops.slice(i, i + BATCH_LIMIT)) {
          batch.update(op.ref, op.data);
        }
        await batch.commit();
      }

      await recordRef.update(undoneState);
    }

    // Activity log entries for restored contacts
    for (const row of plan.restore) {
      await this.db.collection("activities").add({
        userId: actorId,
        userName: actorName,
        userPhoto: "",
        action: "undid tag combine",
        targetId: row.contactId,
        targetName: row.name,
        targetType: "contact",
        type: "edit",
        description: `Restored tags: [${row.current.join(", ")}] → [${row.before.join(", ")}]`,
        createdAt: now,
      });
    }

    // Activity log entries for other restored documents
    for (const row of otherDocsRestore) {
      await this.db.collection("activities").add({
        userId: actorId,
        userName: actorName,
        userPhoto: "",
        action: "undid tag combine",
        targetId: row.documentId,
        targetName: row.name,
        targetType: row.collection,
        type: "edit",
        description: `Restored tags: [${row.after.join(", ")}] → [${row.before.join(", ")}]`,
        createdAt: now,
      });
    }

    return {
      success: true,
      preview,
      restoredCount: plan.restore.length,
      skippedCount: plan.skipped.length,
    };
  }
}
