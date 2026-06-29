import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType, sendNotification } from "./firebase";

// "Walking together" threads — a light conversation between a trainee and the
// full-timer walking with them, attached to a contact and (optionally) to one
// logged interaction. Stored as a subcollection beside interactions/comments:
//   contacts/{contactId}/threads/{threadId}
// interactionId === null is the contact-level thread; otherwise it hangs off that
// interaction. No word "mentor" anywhere.

export type ThreadKind = "note" | "question" | "comment" | "encouragement" | "nudge";

export type ThreadTone = "accent" | "teal" | "amber" | "violet" | "warn";

export interface ThreadReaction {
  by: string;
  emoji: string;
}

export interface ThreadMessage {
  id: string;
  interactionId: string | null;
  from: string; // staff uid
  fromName: string;
  kind: ThreadKind;
  body: string;
  at: string; // ISO
  reactions: ThreadReaction[];
}

// The small reaction set offered on every message.
export const THREAD_REACTIONS = ["🙏", "❤️", "🌱", "✅"] as const;

// Each kind gets its own tone + label. Icons live in the Thread component (so
// this stays free of JSX). nudge = a follow-up reminder, rendered distinctly.
export const THREAD_KINDS: Record<
  ThreadKind,
  { label: string; tone: ThreadTone; verb: string }
> = {
  note: { label: "Note", tone: "accent", verb: "noted" },
  comment: { label: "Comment", tone: "teal", verb: "commented" },
  question: { label: "Question", tone: "amber", verb: "asked" },
  encouragement: { label: "Encourage", tone: "violet", verb: "encouraged" },
  nudge: { label: "Follow-up", tone: "warn", verb: "nudged" },
};

const col = (contactId: string) => collection(db, "contacts", contactId, "threads");
const ref = (contactId: string, id: string) =>
  doc(db, "contacts", contactId, "threads", id);

const norm = (v: string | null | undefined): string | null => v ?? null;

/** Live subscription to a contact's thread messages, oldest-first. */
export function subscribeThreads(
  contactId: string,
  cb: (messages: ThreadMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(contactId), orderBy("at", "asc")),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          // Default required fields so a malformed/partial doc can't break render.
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

/** A thread message tagged with the contact it belongs to. */
export type ThreadMessageWithContact = ThreadMessage & { contactId: string };

/**
 * Live subscription to every thread message across all contacts, each tagged
 * with its contactId. Powers the full-timer inbox (My Day) and the trainee
 * cockpit, which read questions/nudges across contacts at once. No `orderBy`
 * (so it needs no collection-group index) — consumers sort as they like.
 */
export function subscribeAllThreads(
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
    (e) =>
      onError ? onError(e) : console.error("all-threads subscription error", e),
  );
}

/** Messages at a given level — null = the contact-level thread. */
export function threadsFor(
  messages: ThreadMessage[],
  interactionId: string | null = null,
): ThreadMessage[] {
  return messages.filter((m) => norm(m.interactionId) === norm(interactionId));
}

/** Count of messages at a given level (null = contact-level). */
export function countFor(
  messages: ThreadMessage[],
  interactionId: string | null = null,
): number {
  return threadsFor(messages, interactionId).length;
}

// Plain-spoken bell title for a posted message, from the poster's view.
const NOTIFY_TITLE: Record<ThreadKind, (who: string, contact: string) => string> = {
  note: (who, c) => `${who} left a note on ${c}`,
  comment: (who, c) => `${who} commented on ${c}`,
  question: (who, c) => `${who} asked about ${c}`,
  encouragement: (who, c) => `${who} encouraged you about ${c}`,
  nudge: (who, c) => `${who} nudged a follow-up about ${c}`,
};

/** Post a new message to a contact (and optionally to one interaction). When
 * `notify.to` is set, also ping that user's bell (the other party in the walk). */
export async function addThreadMessage(
  contactId: string,
  input: {
    interactionId?: string | null;
    from: string;
    fromName: string;
    kind: ThreadKind;
    body: string;
  },
  notify?: { to?: string | null; contactName?: string },
): Promise<void> {
  const body = input.body.trim();
  try {
    await addDoc(col(contactId), {
      interactionId: input.interactionId ?? null,
      from: input.from,
      fromName: input.fromName,
      kind: input.kind,
      body,
      at: new Date().toISOString(),
      reactions: [] as ThreadReaction[],
    });
    if (notify?.to) {
      const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
      void sendNotification({
        userId: notify.to,
        title: NOTIFY_TITLE[input.kind](who, notify.contactName || "this person"),
        message: body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body,
        type: "info",
        targetId: contactId,
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/threads`);
  }
}

/** Toggle the current user's reaction (by + emoji) on a message. */
export async function toggleReaction(
  contactId: string,
  messageId: string,
  by: string,
  emoji: string,
): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref(contactId, messageId));
      if (!snap.exists()) return;
      const reactions = (snap.data().reactions as ThreadReaction[]) ?? [];
      const has = reactions.some((r) => r.by === by && r.emoji === emoji);
      const next = has
        ? reactions.filter((r) => !(r.by === by && r.emoji === emoji))
        : [...reactions, { by, emoji }];
      tx.update(ref(contactId, messageId), { reactions: next });
    });
  } catch (e) {
    handleFirestoreError(
      e,
      OperationType.UPDATE,
      `contacts/${contactId}/threads/${messageId}`,
    );
  }
}

/**
 * Subscribe a component to a contact's threads. Returns the live message list
 * (sorted oldest-first); re-renders on every post/reaction. Safe to call with an
 * absent contactId (e.g. a closed modal) — it just yields an empty list.
 */
export function useThreads(contactId?: string | null): ThreadMessage[] {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  useEffect(() => {
    if (!contactId) {
      setMessages([]);
      return;
    }
    return subscribeThreads(contactId, setMessages);
  }, [contactId]);
  return messages;
}

/** Subscribe a component to every thread message (tagged with contactId). */
export function useAllThreads(): ThreadMessageWithContact[] {
  const [messages, setMessages] = useState<ThreadMessageWithContact[]>([]);
  useEffect(() => subscribeAllThreads(setMessages), []);
  return messages;
}
