// "Walking together" thread reads/writes for the "From the team" inbox —
// shared Firestore logic behind an injected `db`, covering the subset that My
// Day uses (subscribeAllThreads, addThreadMessage). The pure types/helpers
// live in ../threads; reactions + per-contact subscription aren't needed here.
// Mirrors the web app's src/lib/threads.ts.
import {
  addDoc,
  collection,
  collectionGroup,
  onSnapshot,
  query,
  type Firestore,
} from "firebase/firestore";
import {
  THREAD_NOTIFY_TITLE,
  type ThreadKind,
  type ThreadMessage,
  type ThreadMessageWithContact,
  type ThreadReaction,
} from "../threads";

const col = (db: Firestore, contactId: string) => collection(db, "contacts", contactId, "threads");

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
  notify?: { to?: string | null; contactName?: string },
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
  if (notify?.to && onNotify) {
    const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
    onNotify({
      userId: notify.to,
      title: THREAD_NOTIFY_TITLE[input.kind](who, notify.contactName || "this person"),
      message: body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body,
      type: "info",
      targetId: contactId,
    });
  }
}
