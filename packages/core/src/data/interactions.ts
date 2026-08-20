// Per-contact interaction log ("Conversations" tab) — shared Firestore logic
// behind an injected `db`. Mirrors ContactDetailsModal.tsx's interactions
// subscription/handlers.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { Interaction } from "../types";

import { buildContactActivityPatch } from "./contactActivity";

const col = (db: Firestore, contactId: string) => collection(db, "contacts", contactId, "interactions");

/** Live subscription to a contact's interactions, oldest first. */
export function subscribeInteractions(
  db: Firestore,
  contactId: string,
  cb: (interactions: Interaction[]) => void,
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
          } as Interaction;
        }),
      ),
    (e) => (onError ? onError(e) : console.error("interactions subscription error", e)),
  );
}

/** Log a new interaction. `createdAt` must be a server timestamp — the
 * `interactions` create rule requires `incoming().createdAt == request.time`. */
export async function addInteraction(
  db: Firestore,
  contactId: string,
  input: { content: string; dateTime: string; type: string },
  by: { uid: string; name: string; photoURL?: string | null },
): Promise<void> {
  await addDoc(col(db, contactId), {
    userId: by.uid,
    userName: by.name,
    userPhoto: by.photoURL || "",
    content: input.content.trim(),
    dateTime: input.dateTime,
    type: input.type,
    createdAt: serverTimestamp(),
  });

  const activityPatch = buildContactActivityPatch({
    date: input.dateTime,
    by,
    type: "interaction",
  });
  await updateDoc(doc(db, "contacts", contactId), activityPatch as Record<string, unknown>).catch(() => {
    /* The interaction is the record; don't fail save if parent activity update errors */
  });
}

/** Edit an existing interaction. The update rule restricts writable fields
 * to content/dateTime/type/userName/userPhoto — don't touch userId/createdAt. */
export async function updateInteraction(
  db: Firestore,
  contactId: string,
  interactionId: string,
  patch: { content: string; dateTime: string; type: string },
): Promise<void> {
  await updateDoc(doc(db, "contacts", contactId, "interactions", interactionId), {
    content: patch.content.trim(),
    dateTime: patch.dateTime,
    type: patch.type,
  });
}

/** Delete an interaction. The delete rule allows the owner or a manager. */
export async function deleteInteraction(db: Firestore, contactId: string, interactionId: string): Promise<void> {
  await deleteDoc(doc(db, "contacts", contactId, "interactions", interactionId));
}
