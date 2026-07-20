// Per-contact team discussion ("Discussion" tab) — shared Firestore logic
// behind an injected `db`. Mirrors ContactDetailsModal.tsx's comments
// subscription/handler. No delete — the web modal has no delete UI for
// comments, so this stays read/create only.
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import type { Comment } from "../types";

const col = (db: Firestore, contactId: string) => collection(db, "contacts", contactId, "comments");

/** Live subscription to a contact's discussion thread, oldest first. */
export function subscribeComments(
  db: Firestore,
  contactId: string,
  cb: (comments: Comment[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(db, contactId), orderBy("createdAt", "asc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
          } as Comment;
        }),
      ),
    (e) => (onError ? onError(e) : console.error("comments subscription error", e)),
  );
}

/** Post a comment (optionally a reply via `parentId`). `createdAt` must be a
 * server timestamp — the `comments` create rule requires
 * `incoming().createdAt == request.time`. `parentId` is always written (as
 * `null` for a top-level comment) — the rule's `data.parentId == null || ...`
 * check accesses the field unconditionally, so omitting it on a top-level
 * comment (as the web app's own `handleAddComment` does) fails with
 * "Missing or insufficient permissions", reproduced live while verifying this
 * screen. Returns the new doc id (the caller composes the "notify the
 * contact's creator" side effect). */
export async function addComment(
  db: Firestore,
  contactId: string,
  input: { text: string; parentId?: string | null },
  by: { uid: string; name: string; photoURL?: string | null },
): Promise<string> {
  const docRef = await addDoc(col(db, contactId), {
    userId: by.uid,
    userName: by.name,
    userPhoto: by.photoURL || "",
    text: input.text.trim(),
    createdAt: serverTimestamp(),
    parentId: input.parentId ?? null,
  });
  return docRef.id;
}
