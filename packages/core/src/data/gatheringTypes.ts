// Gathering type ("kind") reads — shared Firestore logic behind an injected
// `db`. Mirrors the web app's src/lib/gatheringTypes.ts. Managed CRUD (add/
// rename/remove a kind) stays web-only for now — mobile only needs to read
// the list for the filter pills.
import { collection, onSnapshot, orderBy, query, type Firestore } from "firebase/firestore";
import type { GatheringType } from "../types";

/** Live subscription to the gathering types, ordered. */
export function subscribeGatheringTypes(
  db: Firestore,
  cb: (types: GatheringType[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "gatheringTypes"), orderBy("order", "asc")),
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
    (e) => (onError ? onError(e) : console.error("gatheringTypes subscription error", e)),
  );
}
