import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType, sendNotification } from "./firebase";
import { subscribeTiedSubcollection } from "./contactQueries";
import { calendarDaysOpen } from "./stream";
import { mentionsClosedByReply } from "../../packages/core/src/mentions";

// "Walking together" threads — the single per-person conversation surface,
// attached to a contact and (optionally) to one logged interaction. Stored as:
//   contacts/{contactId}/threads/{threadId}
// interactionId === null is the contact-level thread; otherwise it hangs off that
// interaction. The old contacts/{id}/comments subcollection has been retired.
// The Full-timers Discussion pane and its `teamThreads` collection are cut
// (cut-or-keep §24); any documents left there stay put and no reader here
// reaches them. No word "mentor" anywhere.

export type ThreadKind = "note" | "question" | "comment" | "encouragement" | "nudge";

export type ThreadTone = "accent" | "teal" | "amber" | "violet" | "warn";

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
  /** When the author last rewrote the body; a row shows "Edited" when set. */
  editedAt?: string | null;
  mentionedUserIds?: string[];
  /** Follow-up asks only: who said they did it, and when. One shared close,
   *  written once and read by everyone tied — there is no per-person dismissal
   *  to track, because the thing tracked is the ask, not five people's reading
   *  of it (#813). `closedBy === from` means the asker retracted it. */
  closedBy?: string | null;
  closedByName?: string | null;
  closedAt?: string | null;
}

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

/** Legacy Full-timers messages may still sit in `threads` with this scope;
 *  nothing reads them any more. */
const isLegacyTeam = (data: { scope?: unknown }) => data.scope === "team";

const norm = (val?: string | null) => (val === "" || val === undefined ? null : val);

function toMessage(d: QueryDocumentSnapshot): ThreadMessage {
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
    editedAt: data.editedAt ?? null,
    mentionedUserIds: Array.isArray(data.mentionedUserIds) ? data.mentionedUserIds : undefined,
    closedBy: data.closedBy ?? null,
    closedByName: data.closedByName ?? null,
    closedAt: data.closedAt ?? null,
  };
}

/** One listener per query, handed back as a single list, newest first. */
function listen<T extends ThreadMessage>(
  queries: [Query, (d: QueryDocumentSnapshot) => T][],
  onUpdate: (messages: T[]) => void,
  onError: (err: unknown) => void,
): () => void {
  const latest: T[][] = queries.map(() => []);
  const unsubs = queries.map(([q, map], i) =>
    onSnapshot(
      q,
      (snap) => {
        latest[i] = snap.docs.map(map);
        onUpdate(latest.length === 1 ? latest[0] : latest.flat().sort((a, b) => b.at.localeCompare(a.at)));
      },
      onError,
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** Subscribe to all messages for a single contact, newest first. */
export function subscribeThreads(
  contactId: string,
  onUpdate: (messages: ThreadMessage[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  return listen(
    [
      [
        query(col(contactId), orderBy("at", "desc")),
        (d: QueryDocumentSnapshot) => toMessage(d),
      ],
    ],
    (messages) => onUpdate(messages.filter((m) => m.scope !== "team")),
    (e) => (onError ? onError(e) : console.error("threads subscription error", e)),
  );
}

// ── In the Conversation (#1604, CONTEXT.md, ADR 0007 amendment) ─────────────
// Having written in a stream within the last 14 days puts what others write
// there after on your own list (inbox, queue, attention) — never a bell entry,
// since nothing there is addressed to you. Worked out from the messages
// themselves: nothing is stored on the contact and it grants nothing.
// Mirrored in the other app's copy; src/test/inTheConversation.test.ts runs
// both against one corpus.

export const IN_THE_CONVERSATION_DAYS = 14;

/** The fields that place a message in its stream and in time. */
export interface ConversationMessage {
  from?: string | null;
  at: string;
  contactId?: string | null;
  interactionId?: string | null;
  scope?: "team" | null;
}

/** Each stream stands alone: a person's Conversation, their Full-timers
 *  stream, and each Interaction's thread. */
export function sameStream(a: ConversationMessage, b: ConversationMessage): boolean {
  return (
    (a.contactId ?? null) === (b.contactId ?? null) &&
    (a.interactionId || null) === (b.interactionId || null) &&
    (a.scope || null) === (b.scope || null)
  );
}

/** Teammates In the Conversation that `of` is written into, as of when it was
 *  written: anyone but its author with a message in the same stream in the 14
 *  days before it. */
export function inTheConversation(messages: readonly ConversationMessage[], of: ConversationMessage): string[] {
  const at = Date.parse(of.at);
  const since = at - IN_THE_CONVERSATION_DAYS * 24 * 60 * 60 * 1000;
  const uids = new Set<string>();
  for (const m of messages) {
    if (!m.from || m.from === of.from || !sameStream(m, of)) continue;
    const t = Date.parse(m.at);
    if (since <= t && t <= at) uids.add(m.from);
  }
  return [...uids];
}

/** A thread message tagged with the contact it belongs to. */
export type ThreadMessageWithContact = ThreadMessage & { contactId: string };

const toMessageWithContact = (d: QueryDocumentSnapshot): ThreadMessageWithContact => {
  const pathParts = typeof d.ref?.path === "string" ? d.ref.path.split("/") : [];
  return { ...toMessage(d), contactId: d.ref.parent?.parent?.id ?? pathParts[1] ?? "" };
};

/** Subscribe to all thread messages across every contact via collectionGroup.
 * The rules allow this only for roles that see every person; a Trainee reads
 * through `subscribeTiedThreads`. Legacy team-scope documents are skipped. */
export function subscribeAllThreads(
  onUpdate: (messages: ThreadMessageWithContact[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  return listen(
    [
      [
        query(collectionGroup(db, "threads"), orderBy("at", "desc")),
        (d: QueryDocumentSnapshot) => toMessageWithContact(d),
      ],
    ],
    (messages) => onUpdate(messages.filter((m) => m.scope !== "team")),
    (e) =>
      onError ? onError(e) : console.error("all-threads subscription error", e),
  );
}

/** A Trainee's thread messages: each visible person's newest, merged and
 * newest first like `subscribeAllThreads`. */
export function subscribeTiedThreads(
  staffId: string,
  onUpdate: (messages: ThreadMessageWithContact[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  return subscribeTiedSubcollection(
    staffId,
    "threads",
    (docs) =>
      onUpdate(
        docs
          .filter((d) => !isLegacyTeam(d.data()))
          .map((d) => toMessageWithContact(d))
          .sort((a, b) => b.at.localeCompare(a.at)),
      ),
    onError,
  );
}

/** Top-level messages at a given level — null = the contact-level thread. */
export function threadsFor(
  messages: ThreadMessage[],
  interactionId: string | null = null,
): ThreadMessage[] {
  return messages.filter(
    (m) =>
      !m.parentId &&
      norm(m.interactionId) === norm(interactionId) &&
      norm(m.scope) === null,
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
): number {
  return messages.filter(
    (m) =>
      norm(m.interactionId) === norm(interactionId) &&
      norm(m.scope) === null,
  ).length;
}

/** Where a notification about a written message opens, in whichever app reads
 *  it. A message on an Interaction's Thread carries the interaction id; a reply
 *  carries its parent so the Thread opens under it; a top-level message opens
 *  just its stream (#1303). */
export function threadNotificationLink(
  contactId: string,
  input: { interactionId?: string | null; parentId?: string | null },
): string {
  if (input.interactionId) return `/people/${contactId}?interaction=${input.interactionId}`;
  return `/people/${contactId}?tab=thread${input.parentId ? `&parent=${input.parentId}` : ""}`;
}

/** The stream's last 14 days, read only to work out whether a reply answers
 *  an open @mention. A failed read changes nothing: the message is already
 *  written and the ask simply stays open. */
async function recentInStream(contactId: string): Promise<ThreadMessageWithContact[]> {
  const since = new Date(Date.now() - IN_THE_CONVERSATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const snap = await getDocs(query(col(contactId), where("at", ">=", since)));
    return snap.docs.map((d) => toMessageWithContact(d)).filter((m) => m.scope !== "team");
  } catch {
    return [];
  }
}

/** The message a reply answers, so a reply can close the @mention it answers.
 *  A failed read leaves the mention open; the reply itself is already written. */
async function parentOf(
  contactId: string,
  input: { parentId?: string | null },
): Promise<ThreadMessageWithContact | null> {
  if (!input.parentId) return null;
  try {
    const snap = await getDoc(ref(contactId, input.parentId));
    if (!snap.exists()) return null;
    return { ...toMessage(snap as unknown as QueryDocumentSnapshot), id: input.parentId, contactId };
  } catch {
    return null;
  }
}

/** Post a new message to a contact (and optionally to one interaction).
 *  Only an @mention is addressed to someone, so only an @mention sends a bell
 *  entry (cut-or-keep §28). Every other message lands in the stream and tells
 *  nobody; the people tied to the person read it where they read the person. */
export async function addThreadMessage(
  contactId: string,
  input: {
    interactionId?: string | null;
    parentId?: string | null;
    from: string;
    fromName: string;
    kind: ThreadKind;
    body: string;
    mentionedUserIds?: string[];
  },
  notify?: {
    /** The person's name, so a mention reads "mentioned you on <name>". */
    contactName?: string;
  },
  /** The id of the message just written, or `null` if the write failed. A
   *  caller showing the message before the round trip needs this to recognise
   *  its own document when the subscription delivers it — matching on the
   *  words instead would confuse two identical messages for one (#1012). */
): Promise<string | null> {
  const body = input.body.trim();
  const mentionedUserIds = (input.mentionedUserIds || []).filter(Boolean);
  let written: string | null = null;
  const at = new Date().toISOString();
  try {
    const created = await addDoc(col(contactId), {
      interactionId: input.interactionId ?? null,
      parentId: input.parentId ?? null,
      scope: null,
      from: input.from,
      fromName: input.fromName,
      kind: input.kind,
      body,
      at,
      ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
    });
    // `addDoc` always hands back a reference; the guard keeps a caller that
    // cannot learn the id from losing the write itself over it.
    written = created?.id ?? null;

    const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
    const contactName = notify?.contactName || "this person";
    const truncatedBody = body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body;
    const targetLink = threadNotificationLink(contactId, input);

    // An @mention is addressed to that person and always buzzes. It carries no
    // coalesceKey: the point of the key is to quiet a conversation nobody was
    // called into, and everyone left who hears this one was called in.
    for (const mUid of mentionedUserIds) {
      if (mUid === input.from) continue;
      void sendNotification({
        userId: mUid,
        title: `${who} mentioned you on ${contactName}`,
        message: truncatedBody,
        type: "info",
        targetId: contactId,
        link: targetLink,
      });
    }

    // A reply from someone an open @mention names closes it, for everyone it
    // named — the parent, or an earlier mention in the same Thread.
    if (written && input.parentId) {
      const recent = await recentInStream(contactId);
      const parent = await parentOf(contactId, input);
      const pool = new Map(recent.map((m) => [m.id, m]));
      if (parent) pool.set(parent.id, parent);
      const reply = { id: written, from: input.from, at, parentId: input.parentId };
      for (const m of mentionsClosedByReply([...pool.values()], reply)) {
        void closeFollowUpAsk(contactId, m.id, { uid: input.from, name: input.fromName });
      }
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `contacts/${contactId}/threads`);
  }
  return written;
}

// ── Closing a follow-up ask (#813) or an @mention ───────────────────────────
// A follow up is texting or emailing the contact after the first encounter. So
// an ask is closed by a person saying they did that — never implicitly. Logging
// an Interaction does not close one and neither does replying in the thread:
// you may have texted them about something else entirely, and closing the ask
// silently would lose it with nobody noticing.

/** Mark a follow-up ask done. Anyone tied to the contact may close it, and it
 *  closes for all of them at once. Closed by its own asker, it reads as
 *  withdrawn ("Never mind") rather than followed up. An @mention closes the
 *  same way — Done (or a reply) from someone it names, Never mind from its
 *  sender — and may sit in the Full-timers stream (`scope: "team"`). */
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

/** Calendar days an ask has been open — the card states it as a fact and does
 *  nothing else with it. An open item that shouts louder every day is the
 *  accumulation problem wearing a different coat. Counted by the stream
 *  model's helper, so the card and the stream never disagree (DRIFT row 38). */
export function daysOpen(m: Pick<ThreadMessage, "at">, now: number = Date.now()): number {
  return calendarDaysOpen(m.at, now);
}

/** Rewrite a message's body as its author, stamping `editedAt`. The Firestore
 *  rule permits only the author to move `body` (and `editedAt`); this mirrors
 *  the rule's own gate, and lets a failed write reject so an editor can stay
 *  open and say so. */
export async function editThreadMessage(
  contactId: string,
  messageId: string,
  body: string,
): Promise<void> {
  try {
    await updateDoc(ref(contactId, messageId), {
      body: body.trim(),
      editedAt: new Date().toISOString(),
    });
  } catch (e) {
    handleFirestoreError(
      e,
      OperationType.UPDATE,
      `contacts/${contactId}/threads/${messageId}`,
    );
  }
}

/** Delete a single thread message. The Firestore rule permits only the author
 *  or an admin (see firestore.rules), so this mirrors the rule's own gate. */
export async function deleteThreadMessage(
  contactId: string,
  messageId: string,
): Promise<void> {
  try {
    await deleteDoc(ref(contactId, messageId));
  } catch (e) {
    handleFirestoreError(
      e,
      OperationType.DELETE,
      `contacts/${contactId}/threads/${messageId}`,
    );
  }
}

/**
 * Subscribe a component to a contact's threads. Returns the live message list
 * (sorted oldest-first); re-renders on every post. Safe to call with an
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
