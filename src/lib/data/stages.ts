// Step (journey-stage) helpers — the list, its order, and keeping the people on
// it when it changes. Steps used to be shaped on the Journey board; since the
// board was cut (cut-or-keep §22) Settings owns them, and this module owns the
// writes so the page never carries its own copy of the batch.
//
// Stages are Firestore docs with an explicit `order` field and are read with
// `orderBy('order')` everywhere (web + mobile core), so "rearrange the steps"
// is just a matter of rewriting each step's `order`. The write carries
// label+color+order per doc because the stages rule (isValidStage) requires all
// three keys on every update.
import { addDoc, collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Stage } from '../../types';

/**
 * The one colour a new step is stored with. A step is no longer painted in its
 * own hue (cut-or-keep §22 cut step colours), but the stages rule still
 * requires the key, so every new step carries the same neutral value.
 */
export const STAGE_COLOR = 'bg-board-slate';

/** Pure: returns a new array with `activeId` moved to `overId`'s position and
 * every stage's `order` reindexed 0..n-1. Returns the input unchanged when the
 * ids are unknown or identical. */
export function applyStageReorder(stages: Stage[], activeId: string, overId: string): Stage[] {
  const ids = stages.map((s) => s.id);
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return stages;

  const next = [...stages];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((s, i) => ({ ...s, order: i }));
}

/** Persists a reordered stage list in one batch, rewriting each doc's order. */
export async function persistStageOrder(stages: Stage[]): Promise<void> {
  const batch = writeBatch(db);
  stages.forEach((s, i) => {
    batch.update(doc(db, 'stages', s.id), {
      label: s.label,
      color: s.color,
      order: i,
    });
  });
  await batch.commit();
}

/** Adds a step at `order` — the end of the list, as Settings appends. */
export async function addStage(label: string, order: number): Promise<void> {
  await addDoc(collection(db, 'stages'), {
    label: label.trim(),
    color: STAGE_COLOR,
    order,
  });
}

/**
 * Renames a step and moves everyone on it to the new label in one batch, so a
 * person is never left pointing at a name that no longer exists. The stage
 * update carries label+color+order because the rule requires all three.
 */
export async function renameStageWithContacts(
  stage: Stage,
  newLabel: string,
  contactIds: readonly string[],
): Promise<void> {
  const label = newLabel.trim();
  const batch = writeBatch(db);
  batch.update(doc(db, 'stages', stage.id), {
    label,
    color: stage.color,
    order: stage.order,
  });
  for (const id of contactIds) {
    batch.update(doc(db, 'contacts', id), { stage: label });
  }
  await batch.commit();
}

/**
 * Removes a step, moving every person on it to `targetLabel` in the same
 * batch. An empty step passes no contacts and is simply deleted. The caller
 * decides which step its people go to; nothing is deleted but the step itself,
 * so the people stay exactly where they were stored (`contacts.stage` is the
 * only field touched).
 */
export async function removeStageWithReassign(
  stageId: string,
  contactIds: readonly string[],
  targetLabel: string,
): Promise<void> {
  const batch = writeBatch(db);
  for (const id of contactIds) {
    batch.update(doc(db, 'contacts', id), { stage: targetLabel });
  }
  batch.delete(doc(db, 'stages', stageId));
  await batch.commit();
}
