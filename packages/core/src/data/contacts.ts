// Contacts/stages/touches reads — shared Firestore logic behind an injected
// `db`. Mirrors the inline subscriptions previously duplicated in the web
// app's src/views/Directory.tsx and apps/mobile/src/lib/useMyDayData.ts.
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { isTrainee, fullTimerIds } from "../walking";
import { stampPartners } from "./partners";
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

/** Live subscription to a single contact (Contact Detail screen). */
export function subscribeContact(
  db: Firestore,
  contactId: string,
  cb: (contact: Contact | null) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "contacts", contactId),
    (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Contact) : null),
    (e) => (onError ? onError(e) : console.error("contact subscription error", e)),
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
  /** How we first met — the fixed "How we met" vocabulary (#356). */
  metVia?: string;
  year?: string;
  major?: string;
  /** Backdates the contact, for the v2 log sheet's "First met" — everything
   * that reads how long you've known someone (the profile's "Known … days",
   * quickCaptureRecents' fallback) reads `createdAt`. Omit for "now". */
  createdAt?: string;
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
  by?: { uid?: string | null; name?: string | null },
  notify?: (payload: ContactNotifyPayload) => void,
): Promise<string> {
  const data: Record<string, any> = {
    ...input,
    lastSeen: "Just now",
    createdAt: input.createdAt || new Date().toISOString(),
    serverCreatedAt: serverTimestamp(),
    createdBy: by?.uid ?? null,
    createdByName: by?.name ?? null,
    // "Cared for by" on the contact detail page binds to `owner` — the
    // mutable field that says who currently has pastoral responsibility for
    // the contact. It defaults to whoever adds the contact (falling back to
    // `null` for the anon sign-up path) and can be reassigned later from the
    // contact page (gated by the firestore rules on `owner` + `coCreators`).
    owner: by?.uid ?? null,
    hasNewActivity: true,
    attendance: {},
  };
  // Gospel partners: a person either member of a pair brings in is shared with
  // the other from the moment they're added (stamped as a co-creator).
  stampPartners(data, by?.uid);
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) {
      delete data[key];
    }
  }
  const docRef = await addDoc(collection(db, "contacts"), data);

  if (notify && by?.uid) {
    notify({
      userId: by.uid,
      title: "Contact Created",
      message: `Successfully added ${input.name} to your directory.`,
      type: "success",
      link: "/directory",
      targetId: docRef.id,
    });

    // No pairing (#549): when a trainee adds someone, the whole full-timer
    // team is told, so nothing the team does goes unseen.
    if (isTrainee(by.uid)) {
      const who = (by.name || "A trainee").split(" ")[0];
      for (const ftId of fullTimerIds()) {
        notify({
          userId: ftId,
          title: `${who} added ${input.name}`,
          message: "A new person in your circle — take a look when you can.",
          type: "assignment",
          targetId: docRef.id,
        });
      }
    }
  }

  return docRef.id;
}

/** Move a contact to a new pipeline stage (The Journey). Mirrors
 * setContactAttendance in data/attendance.ts — activity logging is left to
 * each platform, so this stays a plain write. */
export async function moveContactStage(
  db: Firestore,
  contactId: string,
  newStageLabel: string,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  await updateDoc(doc(db, "contacts", contactId), {
    stage: newStageLabel,
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid ?? null,
    updatedByName: by.name ?? null,
  });
}

export interface ContactUpdateFields {
  name: string;
  initials: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  stage: string;
  tags: string[];
  notes: string;
  spiritualBackground: string;
  /** How we first met — the fixed "How we met" vocabulary (#356). */
  metVia?: string;
  instagram?: string;
}

/** Save the Contact Detail edit form (mirrors ContactDetailsModal's
 * handleUpdate). Activity logging (the field diff) is left to each platform,
 * so this stays a plain write. */
export async function updateContact(
  db: Firestore,
  contactId: string,
  patch: ContactUpdateFields,
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  await updateDoc(doc(db, "contacts", contactId), {
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid ?? null,
    updatedByName: by.name ?? null,
  });
}

/** Persist an add/remove tag edit from Contact Detail's Overview tab. */
export async function updateContactTags(
  db: Firestore,
  contactId: string,
  tags: string[],
  by: { uid?: string | null; name?: string | null },
): Promise<void> {
  await updateDoc(doc(db, "contacts", contactId), {
    tags,
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid ?? null,
    updatedByName: by.name ?? null,
  });
}

/** Delete a contact (Contact Detail's Delete action). Subcollection counts
 * for the audit log are gathered by the caller before calling this, since
 * fetching them is a platform-agnostic read best composed at the call site. */
export async function deleteContact(db: Firestore, contactId: string): Promise<void> {
  await deleteDoc(doc(db, "contacts", contactId));
}
