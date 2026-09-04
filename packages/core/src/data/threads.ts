// "Walking together" thread reads/writes — shared Firestore logic behind an
// injected `db`. Covers both the team-wide feed My Day's inbox uses
// (subscribeAllThreads, addThreadMessage) and the per-contact
// subscription/reaction toggle the Contact Detail screen's <Thread> view
// needs. Mirrors the web app's src/lib/threads.ts.
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import {
  THREAD_NOTIFY_TITLE,
  stakeholderUidsOf,
  type ThreadStakeholders,
  type ThreadKind,
  type ThreadMessage,
  type ThreadMessageWithContact,
  type ThreadReaction,
} from "../threads";

const col = (db: Firestore, contactId: string) => collection(db, "contacts", contactId, "threads");
const msgRef = (db: Firestore, contactId: string, id: string) =>
  doc(db, "contacts", contactId, "threads", id);

/** Live subscription to a single contact's thread messages, oldest-first. */
export function subscribeThreads(
  db: Firestore,
  contactId: string,
  cb: (messages: ThreadMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(db, contactId), orderBy("at", "asc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Partial<ThreadMessage>;
          return {
            id: d.id,
            interactionId: data.interactionId ?? null,
            from: data.from ?? "",
            fromName: data.fromName ?? "",
            kind: (data.kind as ThreadKind) ?? "comment",
            body: data.body ?? "",
            at: data.at ?? new Date().toISOString(),
            reactions: Array.isArray(data.reactions) ? data.reactions : [],
          };
        }),
      ),
    (e) => (onError ? onError(e) : console.error("threads subscription error", e)),
  );
}

/** Toggle `by`'s reaction (emoji) on a message. */
export async function toggleReaction(
  db: Firestore,
  contactId: string,
  messageId: string,
  by: string,
  emoji: string,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(msgRef(db, contactId, messageId));
    if (!snap.exists()) return;
    const reactions = (snap.data().reactions as ThreadReaction[]) ?? [];
    const has = reactions.some((r) => r.by === by && r.emoji === emoji);
    const next = has
      ? reactions.filter((r) => !(r.by === by && r.emoji === emoji))
      : [...reactions, { by, emoji }];
    tx.update(msgRef(db, contactId, messageId), { reactions: next });
  });
}

/** Live subscription to every thread message across all contacts, tagged with contactId. */
export function subscribeAllThreads(
  db: Firestore,
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collectionGroup(db, "threads")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Partial<ThreadMessage>;
          return {
            id: d.id,
            contactId: d.ref.parent.parent?.id ?? "",
            interactionId: data.interactionId ?? null,
            from: data.from ?? "",
            fromName: data.fromName ?? "",
            kind: (data.kind as ThreadKind) ?? "comment",
            body: data.body ?? "",
            at: data.at ?? new Date().toISOString(),
            reactions: Array.isArray(data.reactions) ? data.reactions : [],
          };
        }),
      ),
    (e) => (onError ? onError(e) : console.error("all-threads subscription error", e)),
  );
}

export interface ThreadNotifyPayload {
  userId: string;
  title: string;
  message: string;
  type: "info";
  targetId: string;
}

/**
 * Post a new message to a contact. `onNotify`, when given, is called with the
 * bell payload for `notify.to` — each app supplies its own notification write
 * (e.g. mobile's sendNotification) so this module stays free of that side effect.
 */
export async function addThreadMessage(
  db: Firestore,
  contactId: string,
  input: { interactionId?: string | null; from: string; fromName: string; kind: ThreadKind; body: string },
  notify?: {
    to?: string | null;
    contactName?: string;
    stakeholders?: ThreadStakeholders | null;
  },
  onNotify?: (payload: ThreadNotifyPayload) => void,
): Promise<void> {
  const body = input.body.trim();
  await addDoc(col(db, contactId), {
    interactionId: input.interactionId ?? null,
    from: input.from,
    fromName: input.fromName,
    kind: input.kind,
    body,
    at: new Date().toISOString(),
    reactions: [] as ThreadReaction[],
  });
  if (!onNotify) return;

  // Everyone tied to the contact, then the legacy single recipient — deduped, so
  // nobody is told twice. Before this, mobile passed only `to`, which
  // `walkingRecipient` leaves null for a Trainee: a Trainee posting from the
  // contact screen notified nobody at all (#813).
  const recipients = new Set(stakeholderUidsOf(notify?.stakeholders, input.from));
  if (notify?.to && notify.to !== input.from) recipients.add(notify.to);
  if (recipients.size === 0) return;

  const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
  const title = THREAD_NOTIFY_TITLE[input.kind](who, notify?.contactName || "this person");
  const message = body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body;
  for (const userId of recipients) {
    onNotify({ userId, title, message, type: "info", targetId: contactId });
  }
}
