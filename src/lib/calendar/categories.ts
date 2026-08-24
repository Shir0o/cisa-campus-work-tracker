// Owner-editable category labels and hues, stored at `config/categories`.
import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import { calDb } from './firebase';
import {
  CATEGORIES,
  CAT_BY_ID,
  DEFAULT_CATEGORIES,
  tokensForHue,
  type CategoryId,
} from './calendar';

export interface CategoryOverride {
  label?: string;
  hue?: number;
}
export type CategoryOverrides = Partial<Record<CategoryId, CategoryOverride>>;

let version = 0;
const subscribers = new Set<() => void>();
const notify = () => {
  version++;
  subscribers.forEach((cb) => cb());
};

function applyOverrides(overrides: CategoryOverrides): void {
  DEFAULT_CATEGORIES.forEach((def, i) => {
    const target = CATEGORIES[i];
    const ov = overrides[def.id];
    target.label = ov?.label?.trim() || def.label;
    if (ov?.hue != null && Number.isFinite(ov.hue)) {
      const t = tokensForHue(ov.hue);
      target.hue = ov.hue;
      target.dot = t.dot;
      target.soft = t.soft;
      target.ink = t.ink;
    } else {
      target.hue = def.hue;
      target.dot = def.dot;
      target.soft = def.soft;
      target.ink = def.ink;
    }
    CAT_BY_ID[def.id] = target;
  });
  notify();
}

export function subscribeCategoryOverrides(
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(calDb, 'config', 'categories'),
    (snap) => {
      const raw = (snap.exists() ? snap.data().overrides : undefined) as
        | CategoryOverrides
        | undefined;
      applyOverrides(raw ?? {});
    },
    (err) => onError?.(err),
  );
}

export async function setCategoryOverride(
  id: CategoryId,
  patch: CategoryOverride,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await setDoc(
    doc(calDb, 'config', 'categories'),
    { overrides: { [id]: patch } },
    { merge: true },
  );
}

export async function clearCategoryOverride(id: CategoryId): Promise<void> {
  await setDoc(
    doc(calDb, 'config', 'categories'),
    { overrides: { [id]: deleteField() } },
    { merge: true },
  );
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
function getSnapshot(): number {
  return version;
}
export function useCategoryVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
