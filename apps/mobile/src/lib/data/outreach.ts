// Outreach writes — thin mobile wrapper around the shared @cisa/core logic
// (behind an injected `db`), plus mobile's own activity log (kept out of core
// since each platform has its own logActivity). Only full-timers reach this
// page, so every write here is admin-only by construction — the firestore
// rules enforce the same gate on the `outreach` collection.
import * as core from '@cisa/core';
import { db, handleFirestoreError, logActivity, OperationType } from '../firebase';

export function subscribeOutreach(
  cb: (records: core.OutreachRecord[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return core.subscribeOutreach(db, cb, onError);
}

const namesSummary = (names: string[]) =>
  names.length ? `${names.length} ${names.length === 1 ? 'person' : 'people'} left their number: ${names.join(', ')}.` : 'No names written down.';

/** Log an outreach — every filled name becomes a real contact inside
 * core.addOutreach; the follow-up to-do only when the logger may create tasks
 * (viewers can't, so their names log without the auto-todo). */
export async function addOutreach(
  draft: core.OutreachDraft,
  by: { uid?: string | null; name?: string | null; canCreateTasks?: boolean },
): Promise<string | undefined> {
  try {
    const id = await core.addOutreach(db, draft, by);
    void logActivity({
      action: 'logged an outreach',
      targetId: id,
      targetName: draft.where.trim(),
      targetType: 'event',
      type: 'create',
      description: namesSummary(draft.names.filter((n) => n.name.trim()).map((n) => n.name.trim())),
    });
    return id;
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'outreach');
  }
}

export async function updateOutreach(
  id: string,
  patch: {
    date?: string;
    where?: string;
    went?: string[];
    others?: number;
    handed?: core.OutreachHanded;
    how?: string;
    photoCount?: number;
  },
): Promise<void> {
  try {
    await core.updateOutreach(db, id, patch);
    void logActivity({
      action: 'edited the outreach at',
      targetId: id,
      targetName: patch.where?.trim() || 'an outreach',
      targetType: 'event',
      type: 'edit',
      description: patch.where?.trim(),
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `outreach/${id}`);
  }
}

export async function removeOutreach(id: string, where: string): Promise<void> {
  try {
    await core.removeOutreach(db, id);
    void logActivity({
      action: 'removed the outreach at',
      targetId: id,
      targetName: where,
      targetType: 'event',
      type: 'edit',
      description: where,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `outreach/${id}`);
  }
}

/** "I'll take this" — claim a waiting name and put the ring on your own list. */
export async function takeOutreachName(
  outreachId: string,
  name: core.OutreachName,
  where: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  try {
    await core.takeOutreachName(db, outreachId, name, where, by);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `outreach/${outreachId}`);
  }
}
