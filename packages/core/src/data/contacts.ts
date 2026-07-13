// Contacts/stages/touches reads — shared Firestore logic behind an injected
// `db`. Mirrors the inline subscriptions previously duplicated in the web
// app's src/views/Directory.tsx and apps/mobile/src/lib/useMyDayData.ts.
import {
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
} from "firebase/firestore";
import type { Touch } from "../myday";
import type { Contact, Interaction, Stage } from "../types";

export function subscribeContacts(
  db: Firestore,
  cb: (contacts: Contact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "contacts")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]),
    (e) => (onError ? onError(e) : console.error("contacts subscription error", e)),
  );
}

export function subscribeStages(
  db: Firestore,
  cb: (stages: Stage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "stages"), orderBy("order", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Stage[]),
    (e) => (onError ? onError(e) : console.error("stages subscription error", e)),
  );
}

// Same path-segment convention as the web/mobile My Day ingestion:
// contacts/{contactId}/interactions/{id} → segment 1 is the contactId.
const contactIdFromPath = (path: string) => path.split("/")[1] ?? "";

/** Live "last touch" feed — interactions + comments across every contact,
 * flattened to a flat Touch list. Mirrors apps/mobile/src/lib/useMyDayData.ts's
 * interactions/comments collection-group subscriptions. */
export function subscribeTouches(
  db: Firestore,
  cb: (touches: Touch[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  let interactions: Interaction[] = [];
  let comments: Touch[] = [];

  const publish = () => {
    const interactionTouches: Touch[] = interactions.map((i) => ({
      contactId: i.contactId ?? "",
      ms: new Date(i.createdAt ?? "").getTime(),
      note: (i.content ?? "").trim(),
    }));
    cb([...interactionTouches, ...comments].filter((t) => !Number.isNaN(t.ms)));
  };

  const handleError = (e: unknown) =>
    onError ? onError(e) : console.error("touches subscription error", e);

  const unsubInteractions = onSnapshot(
    query(collectionGroup(db, "interactions"), orderBy("createdAt", "desc"), limit(500)),
    (snap) => {
      interactions = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
        contactId: contactIdFromPath(d.ref.path),
      })) as Interaction[];
      publish();
    },
    handleError,
  );
  const unsubComments = onSnapshot(
    query(collectionGroup(db, "comments"), orderBy("createdAt", "desc"), limit(500)),
    (snap) => {
      comments = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          contactId: contactIdFromPath(d.ref.path),
          ms: new Date((data.createdAt as string) ?? "").getTime(),
          note: ((data.text as string) ?? "").trim(),
        };
      });
      publish();
    },
    handleError,
  );

  return () => {
    unsubInteractions();
    unsubComments();
  };
}
