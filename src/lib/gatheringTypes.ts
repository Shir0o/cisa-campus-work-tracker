import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType } from "./firebase";
import type { GatheringType } from "../types";

// The kinds of gathering a fellowship holds (Weekly / Small Group / …). A managed
// Firestore collection so the list is team-shared and editable (mirrors `stages`).
// Existing events reference a type by NAME, so renaming a type remaps the events
// carrying the old name.
//   gatheringTypes/{id} → { name, blurb, order }

const col = () => collection(db, "gatheringTypes");

// Seeded when the collection is empty (admin-only) — the four classic kinds.
export const DEFAULT_GATHERING_TYPES: { name: string; blurb: string }[] = [
  { name: "Weekly", blurb: "Friday night, the whole fellowship" },
  { name: "Small Group", blurb: "A handful, around a table" },
  { name: "Special", blurb: "A one-off worship gathering" },
  { name: "Outreach", blurb: "Out on campus, meeting people" },
];

/** Live subscription to the gathering types, ordered. */
export function subscribeGatheringTypes(
  cb: (types: GatheringType[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(), orderBy("order", "asc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Partial<GatheringType>;
          return {
            id: d.id,
            name: data.name ?? "",
            blurb: data.blurb ?? "",
            order: data.order ?? 0,
          };
        }),
      ),
    (e) =>
      onError ? onError(e) : console.error("gatheringTypes subscription error", e),
  );
}

/** The warm one-line blurb for a type name (falls back to empty). */
export function blurbOf(types: GatheringType[], name?: string): string {
  if (!name) return "";
  return types.find((t) => t.name === name)?.blurb ?? "";
}

/** Append a new type at the end of the list. */
export async function addGatheringType(input: {
  name: string;
  blurb?: string;
  order: number;
}): Promise<void> {
  try {
    await addDoc(col(), {
      name: input.name.trim(),
      blurb: (input.blurb ?? "").trim(),
      order: input.order,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "gatheringTypes");
  }
}

/**
 * Update a type. When the name changes, remap every event carrying the old type
 * name to the new one (mirrors the stages→contacts migration in OutreachBoard).
 */
export async function updateGatheringType(
  id: string,
  patch: { name: string; blurb?: string },
  prevName?: string,
): Promise<void> {
  const name = patch.name.trim();
  try {
    await updateDoc(doc(db, "gatheringTypes", id), {
      name,
      blurb: (patch.blurb ?? "").trim(),
    });
    if (prevName && prevName !== name) {
      const evSnap = await getDocs(query(collection(db, "events"), where("type", "==", prevName)));
      if (!evSnap.empty) {
        const batch = writeBatch(db);
        evSnap.docs.forEach((d) => batch.update(d.ref, { type: name }));
        await batch.commit();
      }
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `gatheringTypes/${id}`);
  }
}

/** Retire a type. Past events keep their stored type label. */
export async function removeGatheringType(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "gatheringTypes", id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `gatheringTypes/${id}`);
  }
}

/** One-shot: seed the default kinds if the collection is empty (admin-only). */
export async function seedDefaultGatheringTypesIfEmpty(): Promise<void> {
  try {
    const snap = await getDocs(col());
    if (!snap.empty) return;
    const batch = writeBatch(db);
    DEFAULT_GATHERING_TYPES.forEach((t, i) => {
      batch.set(doc(col()), { name: t.name, blurb: t.blurb, order: i });
    });
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "gatheringTypes");
  }
}

/** Subscribe a component to the gathering types (re-renders on any change). */
export function useGatheringTypes(): GatheringType[] {
  const [types, setTypes] = useState<GatheringType[]>([]);
  useEffect(() => subscribeGatheringTypes(setTypes), []);
  return types;
}
