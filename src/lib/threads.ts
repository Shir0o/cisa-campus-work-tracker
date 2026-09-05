import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType, sendNotification } from "./firebase";
import { sendPushNotification } from "./push";
import { isFullTimer } from "./walking";

// "Walking together" threads — the single per-person conversation surface,
// attached to a contact and (optionally) to one logged interaction. Stored as:
//   contacts/{contactId}/threads/{threadId}
// interactionId === null is the contact-level thread; otherwise it hangs off that
// interaction. The old contacts/{id}/comments subcollection has been retired;
// Full-timer-only Discussion lives here with `scope: "team"`. No word "mentor"
// anywhere.

export type ThreadKind = "note" | "question" | "comment" | "encouragement" | "nudge";

export type ThreadTone = "accent" | "teal" | "amber" | "violet" | "warn";

export interface ThreadReaction {
  by: string;
  emoji: string;
}

export interface ThreadMessage {
  id: string;
  interactionId: string | null;
  parentId?: string | null;
  scope?: "team" | null;
  from: string; // staff uid
  fromName: string;
  kind: ThreadKind;
  body: string;
  at: string; // ISO
  reactions: ThreadReaction[];
  mentionedUserIds?: string[];
  /** Follow-up asks only: who said they did it, and when. One shared close,
   *  written once and read by everyone tied — there is no per-person dismissal
   *  to track, because the thing tracked is the ask, not five people's reading
   *  of it (#813). `closedBy === from` means the asker retracted it. */
  closedBy?: string | null;
  closedByName?: string | null;
  closedAt?: string | null;
}

// The single like reaction offered on every message.
export const THREAD_REACTIONS = ["❤️"] as const;

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
const ref = (contactId: string, messageId: string) =>
  doc(db, "contacts", contactId, "threads", messageId);

const norm = (val?: string | null) => (val === "" || val === undefined ? null : val);

/** Subscribe to all messages for a single contact, newest first. */
export function subscribeThreads(
  contactId: string,
  onUpdate: (messages: ThreadMessage[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const q = query(col(contactId), orderBy("at", "desc"));
  return onSnapshot(
    q,
    (snap) =>
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data() as Partial<ThreadMessage>;
          return {
            id: d.id,
            interactionId: data.interactionId ?? null,
            parentId: data.parentId ?? null,
            scope: (data.scope as "team") ?? null,
            from: data.from ?? "",
            fromName: data.fromName ?? "",
            kind: (data.kind as ThreadKind) ?? "comment",
            body: data.body ?? "",
            at: data.at ?? new Date().toISOString(),
            reactions: Array.isArray(data.reactions) ? data.reactions : [],
            mentionedUserIds: Array.isArray(data.mentionedUserIds) ? data.mentionedUserIds : undefined,
            closedBy: data.closedBy ?? null,
            closedByName: data.closedByName ?? null,
            closedAt: data.closedAt ?? null,
          };
        }),
      ),
    (e) => (onError ? onError(e) : console.error("threads subscription error", e)),
  );
}

/** A thread message tagged with the contact it belongs to. */
export type ThreadMessageWithContact = ThreadMessage & { contactId: string };

/** Subscribe to all thread messages across every contact via collectionGroup. */
export function subscribeAllThreads(
  onUpdate: (messages: ThreadMessageWithContact[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const q = query(
    collectionGroup(db, "threads"),
    orderBy("at", "desc"),
  );
  return onSnapshot(
    q,
    (snap) =>
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data() as Partial<ThreadMessage>;
          const pathParts = typeof d.ref?.path === "string" ? d.ref.path.split("/") : [];
          return {
            id: d.id,
            contactId: d.ref.parent?.parent?.id ?? pathParts[1] ?? "",
            interactionId: data.interactionId ?? null,
            parentId: data.parentId ?? null,
            scope: (data.scope as "team") ?? null,
            from: data.from ?? "",
            fromName: data.fromName ?? "",
            kind: (data.kind as ThreadKind) ?? "comment",
            body: data.body ?? "",
            at: data.at ?? new Date().toISOString(),
            reactions: Array.isArray(data.reactions) ? data.reactions : [],
            mentionedUserIds: Array.isArray(data.mentionedUserIds) ? data.mentionedUserIds : undefined,
            closedBy: data.closedBy ?? null,
            closedByName: data.closedByName ?? null,
            closedAt: data.closedAt ?? null,
          };
        }),
      ),
    (e) =>
      onError ? onError(e) : console.error("all-threads subscription error", e),
  );
}

/** Top-level messages at a given level — null = the contact-level thread. */
export function threadsFor(
  messages: ThreadMessage[],
  interactionId: string | null = null,
  scope: "team" | null = null,
): ThreadMessage[] {
  return messages.filter(
    (m) =>
      !m.parentId &&
      norm(m.interactionId) === norm(interactionId) &&
      norm(m.scope) === norm(scope),
  );
}

/** Replies under a given parent message. */
export function repliesOf(
  messages: ThreadMessage[],
  parentId: string,
): ThreadMessage[] {
  return messages.filter((m) => m.parentId === parentId);
}

/** Count of messages at a given level (null = contact-level). */
export function countFor(
  messages: ThreadMessage[],
  interactionId: string | null = null,
  scope: "team" | null = null,
): number {
  return messages.filter(
    (m) =>
      norm(m.interactionId) === norm(interactionId) &&
      norm(m.scope) === norm(scope),
  ).length;
}

// Plain-spoken bell title for a posted message, from the poster's view. Every
// recipient gets the title for the KIND that was written — a question must not
// arrive as "commented on", which is what the stakeholder path used to send
// regardless of kind (#813).
const NOTIFY_TITLE: Record<ThreadKind, (who: string, contact: string) => string> = {
  note: (who, c) => `${who} left a note on ${c}`,
  comment: (who, c) => `${who} commented on ${c}`,
  question: (who, c) => `${who} asked about ${c}`,
  encouragement: (who, c) => `${who} encouraged you about ${c}`,
  nudge: (who, c) => `${who} asked for a follow-up on ${c}`,
};

const TEAM_NOTIFY_TITLE = (who: string, contact: string) =>
  `${who} posted in the Full-timers thread on ${contact}`;

/** Everyone tied to a contact: they added them, they are the adder's gospel
 *  partner, or they are the assigned caregiver. The fourth tie — teammates
 *  keeping this person on their own My Day — is private to each of them and is
 *  resolved on their own feed instead, never fanned out from here (#813). */
export interface ThreadStakeholders {
  createdBy?: string | null;
  coCreators?: string[] | null;
  owner?: string | null;
}

/** The uids on the contact document, deduped, minus the poster. */
export function stakeholderUidsOf(
  stakeholders: ThreadStakeholders | null | undefined,
  from: string,
): string[] {
  if (!stakeholders) return [];
  const all = [
    stakeholders.createdBy,
    stakeholders.owner,
    ...(stakeholders.coCreators || []),
  ].filter((id): id is string => !!id);
  return [...new Set(all)].filter((id) => id !== from);
}

/** A push that says something happened about one person. Held to one per
 *  contact per person per hour, server-side; the bell keeps every message. */
function pushAbout(userId: string, contactId: string, title: string, body: string, link: string) {
  void sendPushNotification({
    userId,
    title,
    body,
    data: { link, targetId: contactId },
    coalesceKey: `contact:${contactId}`,
    coalesceMinutes: 60,
  });
}

/** Post a new message to a contact (and optionally to one interaction). Dispatches
 * notifications to mentioned users, contact stakeholders, or legacy notify.to. */
export async function addThreadMessage(
  contactId: string,
  input: {
    interactionId?: string | null;
    parentId?: string | null;
    scope?: "team" | null;
    from: string;
    fromName: string;
    kind: ThreadKind;
    body: string;
    mentionedUserIds?: string[];
  },
  notify?: {
    to?: string | null;
    contactName?: string;
    stakeholders?: ThreadStakeholders | null;
  },
): Promise<void> {
  const body = input.body.trim();
  const mentionedUserIds = (input.mentionedUserIds || []).filter(Boolean);
  try {
    await addDoc(col(contactId), {
      interactionId: input.interactionId ?? null,
      parentId: input.parentId ?? null,
      scope: input.scope ?? null,
      from: input.from,
      fromName: input.fromName,
      kind: input.kind,
      body,
      at: new Date().toISOString(),
      reactions: [] as ThreadReaction[],
      ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
    });

    const isTeamScope = input.scope === "team";
    const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
    const contactName = notify?.contactName || "this person";
    const truncatedBody = body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body;
    const targetLink = isTeamScope
      ? `/people/${contactId}?tab=discussion`
      : `/people/${contactId}?tab=thread`;

    // 1. Resolve recipients:
    // Mentions: receive mention-specific alert
    // Stakeholders: receive comment alert
    // Legacy notify.to: receives kind-shaped alert
    const notifiedUserIds = new Set<string>();

    // Helper to check if a user is allowed to receive team-scoped messages
    const isAllowedRecipient = (uid: string) => {
      if (!isTeamScope) return true;
      return isFullTimer(uid);
    };

    // An @mention narrows everything to the person named: they are the only one
    // who gets the personal wording, and the only one pushed.
    const narrowed = mentionedUserIds.length > 0;

    for (const mUid of mentionedUserIds) {
      if (mUid !== input.from && isAllowedRecipient(mUid)) {
        notifiedUserIds.add(mUid);
        const title = isTeamScope
          ? `${who} mentioned you in the Full-timers thread on ${contactName}`
          : `${who} mentioned you on ${contactName}`;
        void sendNotification({
          userId: mUid,
          title,
          message: truncatedBody,
          type: "info",
          targetId: contactId,
          link: targetLink,
        });
        pushAbout(mUid, contactId, title, truncatedBody, targetLink);
      }
    }

    // Everyone tied to the contact: creator, gospel partners, and the assigned
    // caregiver. `owner` was a tie everywhere in the product except here.
    for (const sUid of stakeholderUidsOf(notify?.stakeholders, input.from)) {
      if (notifiedUserIds.has(sUid) || !isAllowedRecipient(sUid)) continue;
      notifiedUserIds.add(sUid);
      const title = isTeamScope
        ? TEAM_NOTIFY_TITLE(who, contactName)
        : NOTIFY_TITLE[input.kind](who, contactName);
      void sendNotification({
        userId: sUid,
        title,
        message: truncatedBody,
        type: "info",
        targetId: contactId,
        link: targetLink,
      });
      // A mention means "this one is for you" — the rest hear about it in the
      // bell without their phone going off.
      if (!narrowed) pushAbout(sUid, contactId, title, truncatedBody, targetLink);
    }

    // Legacy fallback: notify.to when the caller passed no stakeholders.
    if (notify?.to && notify.to !== input.from && !notifiedUserIds.has(notify.to) && isAllowedRecipient(notify.to)) {
      const title = NOTIFY_TITLE[input.kind](who, contactName);
      void sendNotification({
        userId: notify.to,
        title,
        message: truncatedBody,
        type: "info",
        targetId: contactId,
        link: targetLink,
      });
      if (!narrowed) pushAbout(notify.to, contactId, title, truncatedBody, targetLink);
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/threads`);
  }
}

// ── Closing a follow-up ask (#813) ──────────────────────────────────────────
// A follow up is texting or emailing the contact after the first encounter. So
// an ask is closed by a person saying they did that — never implicitly. Logging
// an Interaction does not close one and neither does replying in the thread:
// you may have texted them about something else entirely, and closing the ask
// silently would lose it with nobody noticing.

/** Mark a follow-up ask done. Anyone tied to the contact may close it, and it
 *  closes for all of them at once. `retract` records the asker withdrawing it
 *  ("Never mind") rather than anyone having followed up. */
export async function closeFollowUpAsk(
  contactId: string,
  messageId: string,
  by: { uid: string; name?: string | null },
): Promise<void> {
  try {
    await updateDoc(ref(contactId, messageId), {
      closedBy: by.uid,
      closedByName: by.name || null,
      closedAt: new Date().toISOString(),
    });
  } catch (e) {
    handleFirestoreError(
      e,
      OperationType.UPDATE,
      `contacts/${contactId}/threads/${messageId}`,
    );
  }
}

/** Undo a close — the snackbar's only job. */
export async function reopenFollowUpAsk(
  contactId: string,
  messageId: string,
): Promise<void> {
  try {
    await updateDoc(ref(contactId, messageId), {
      closedBy: null,
      closedByName: null,
      closedAt: null,
    });
  } catch (e) {
    handleFirestoreError(
      e,
      OperationType.UPDATE,
      `contacts/${contactId}/threads/${messageId}`,
    );
  }
}

/** True when this message is a follow-up ask still waiting on someone. */
export function isOpenAsk(m: Pick<ThreadMessage, "kind" | "closedAt">): boolean {
  return m.kind === "nudge" && !m.closedAt;
}

/** Whole days an ask has been open — the card states it as a fact and does
 *  nothing else with it. An open item that shouts louder every day is the
 *  accumulation problem wearing a different coat. */
export function daysOpen(m: Pick<ThreadMessage, "at">, now: number = Date.now()): number {
  const t = new Date(m.at).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
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
