// Stage (journey-step) ordering helpers for the outreach board.
//
// Stages are Firestore docs with an explicit `order` field and are read with
// `orderBy('order')` everywhere (web + mobile core), so "rearrange the
// journey" is just a matter of rewriting each stage's `order`. The write
// carries label+color+order per doc because the stages rule (isValidStage)
// requires all three keys on every update.
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Stage } from '../../types';

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
