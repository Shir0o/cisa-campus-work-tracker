// Standard tags reads/writes (#1437, ADR 0039) — shared Firestore logic behind
// an injected `db`. One team-wide doc `settings/standard_tags` holds the ordered
// list Full-timers edit; approved users read it for the suggestion chips and the
// combine targets. Season tags are standard by pattern and are never stored.
import { doc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import { resolveStandardTags } from "../tags";

/** Live subscription to the team-wide standard tags (settings/standard_tags). */
export function subscribeStandardTags(
  db: Firestore,
  cb: (tags: string[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "settings", "standard_tags"),
    (snap) => {
      const data = typeof snap?.data === "function" ? snap.data() : undefined;
      cb(resolveStandardTags((data as { tags?: string[] } | undefined)?.tags));
    },
    (e) => (onError ? onError(e) : console.error("standard tags subscription error", e)),
  );
}

/** Merge-write the standard tags list. Rules gate it to Full-timers. */
export async function saveStandardTags(db: Firestore, tags: string[]): Promise<void> {
  await setDoc(doc(db, "settings", "standard_tags"), { tags });
}
