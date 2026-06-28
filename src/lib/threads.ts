import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType } from "./firebase";

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

/** Post a new message to a contact (and optionally to one interaction). */
export async function addThreadMessage(
  contactId: string,
  input: {
    interactionId?: string | null;
    from: string;
    fromName: string;
    kind: ThreadKind;
    body: string;
  },
): Promise<void> {
  try {
    await addDoc(col(contactId), {
      interactionId: input.interactionId ?? null,
      from: input.from,
      fromName: input.fromName,
      kind: input.kind,
      body: input.body.trim(),
      at: new Date().toISOString(),
      reactions: [] as ThreadReaction[],
    });
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
