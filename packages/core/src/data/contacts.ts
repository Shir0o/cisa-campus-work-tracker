// Contacts/stages/touches reads — shared Firestore logic behind an injected
// `db`. Mirrors the inline subscriptions previously duplicated in the web
// app's src/views/Directory.tsx and apps/mobile/src/lib/useMyDayData.ts.
import {
  addDoc,
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { fullTimerOf, isTrainee } from "../walking";
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

export interface NewContactInput {
  name: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  stage: string;
  tags: string[];
  notes: string;
  spiritualBackground: string;
  initials: string;
}

export interface ContactNotifyPayload {
  userId: string;
  title: string;
  message: string;
  type: "success" | "assignment";
  link?: string;
  targetId: string;
}

/**
 * Create a new contact (mirrors the web app's NewContactModal). `notify`, when
 * given, is called once for the creator's own confirmation and — reusing the
 * walking-together relationship — once more for the creator's full-timer when
 * the creator is a trainee. Each app supplies its own notification write (e.g.
 * mobile's sendNotification) so this module stays free of that side effect.
 * Season-tag merging happens at the call site, not here.
 */
export async function addContact(
  db: Firestore,
  input: NewContactInput,
  by: { uid?: string | null; name?: string | null },
  notify?: (payload: ContactNotifyPayload) => void,
): Promise<string> {
  const docRef = await addDoc(collection(db, "contacts"), {
    ...input,
    lastSeen: "Just now",
    createdAt: new Date().toISOString(),
    serverCreatedAt: serverTimestamp(),
    createdBy: by.uid ?? null,
    createdByName: by.name ?? null,
    hasNewActivity: true,
    attendance: {},
  });

  if (notify && by.uid) {
    notify({
      userId: by.uid,
      title: "Contact Created",
      message: `Successfully added ${input.name} to your directory.`,
      type: "success",
      link: "/directory",
      targetId: docRef.id,
    });

    const ft = isTrainee(by.uid) ? fullTimerOf(by.uid) : null;
    if (ft) {
      notify({
        userId: ft,
        title: `${(by.name || "Your trainee").split(" ")[0]} added ${input.name}`,
        message: "A new person in your circle — take a look when you can.",
        type: "assignment",
        targetId: docRef.id,
      });
    }
  }

  return docRef.id;
}
