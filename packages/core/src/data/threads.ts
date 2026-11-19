// "Walking together" thread reads/writes — shared Firestore logic behind an
// injected `db`. Covers both the team-wide feed My Day's inbox uses
// (subscribeAllThreads, addThreadMessage) and the per-contact
// subscription the Contact Detail screen's <Thread> view
// needs. Mirrors the web app's src/lib/threads.ts.
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
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  THREAD_NOTIFY_TITLE,
  IN_THE_CONVERSATION_DAYS,
  inTheConversation,
  stakeholderUidsOf,
  type ThreadStakeholders,
  type ThreadKind,
  type ThreadMessage,
  type ThreadMessageWithContact,
} from "../threads";
import { isFullTimer } from "../walking";
import { mentionsClosedByReply } from "../mentions";
import { subscribeTiedSubcollection } from "./contacts";

// The Full-timers Discussion pane and its `teamThreads` collection are cut
// (cut-or-keep §24). Any legacy team-scope documents left in `threads` are
// skipped by every reader here; nothing writes them.
const col = (db: Firestore, contactId: string) =>
  collection(db, "contacts", contactId, "threads");
const msgRef = (db: Firestore, contactId: string, id: string) =>
  doc(db, "contacts", contactId, "threads", id);
const isLegacyTeam = (data: Partial<ThreadMessage>) => data.scope === "team";

function toMessage(id: string, data: Partial<ThreadMessage>): ThreadMessage {
  return {
    id,
    interactionId: data.interactionId ?? null,
    parentId: data.parentId ?? null,
    scope: data.scope ?? null,
    from: data.from ?? "",
    fromName: data.fromName ?? "",
    kind: (data.kind as ThreadKind) ?? "comment",
    body: data.body ?? "",
    at: data.at ?? new Date().toISOString(),
    editedAt: data.editedAt ?? null,
    closedBy: data.closedBy ?? null,
    closedByName: data.closedByName ?? null,
    closedAt: data.closedAt ?? null,
    mentionedUserIds: Array.isArray(data.mentionedUserIds) ? data.mentionedUserIds : undefined,
  };
}

/** Live subscription to a single contact's thread messages, oldest-first.
 *  Mirrors the web app's src/lib/threads.ts. */
export function subscribeThreads(
  db: Firestore,
  contactId: string,
  cb: (messages: ThreadMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(db, contactId), orderBy("at", "asc")),
    (snap) => {
      cb(
        snap.docs
          .map((d) => toMessage(d.id, d.data() as Partial<ThreadMessage>))
          .filter((m) => m.scope !== "team"),
      );
    },
    (e) => (onError ? onError(e) : console.error("threads subscription error", e)),
  );
}

/** Delete a single thread message. The Firestore rule permits only the author
 *  or an admin (see firestore.rules), so this mirrors the rule's own gate. */
export async function deleteThreadMessage(
  db: Firestore,
  contactId: string,
  messageId: string,
): Promise<void> {
  await deleteDoc(msgRef(db, contactId, messageId));
}

/** Close a Follow-up ask as `by`: they followed up, or — when `by` is the
 *  asker — withdrew it ("Never mind"). It closes once, for everyone tied; only
 *  these three keys move (#813). An @mention closes the same way: Done (or a
 *  reply) from someone it names, Never mind from its sender. Mirrors the web
 *  app's `closeFollowUpAsk`. */
export async function closeFollowUpAsk(
  db: Firestore,
  contactId: string,
  messageId: string,
  by: { uid: string; name?: string | null },
): Promise<void> {
  await updateDoc(msgRef(db, contactId, messageId), {
    closedBy: by.uid,
    closedByName: by.name || null,
    closedAt: new Date().toISOString(),
  });
}

/** Rewrite a message's body as its author, stamping `editedAt`. The Firestore
 *  rule permits only the author to move `body` (and `editedAt`); this mirrors
 *  the rule's own gate. Mirrors the web app's `editThreadMessage`. */
export async function editThreadMessage(
  db: Firestore,
  contactId: string,
  messageId: string,
  body: string,
): Promise<void> {
  await updateDoc(msgRef(db, contactId, messageId), {
    body: body.trim(),
    editedAt: new Date().toISOString(),
  });
}

const toMessageWithContact = (d: QueryDocumentSnapshot): ThreadMessageWithContact => {
  const data = d.data() as Partial<ThreadMessage>;
  return {
    id: d.id,
    contactId: d.ref.parent.parent?.id ?? "",
    interactionId: data.interactionId ?? null,
    parentId: data.parentId ?? null,
    scope: data.scope ?? null,
    from: data.from ?? "",
    fromName: data.fromName ?? "",
    kind: (data.kind as ThreadKind) ?? "comment",
    body: data.body ?? "",
    at: data.at ?? new Date().toISOString(),
    closedBy: data.closedBy ?? null,
    closedByName: data.closedByName ?? null,
    closedAt: data.closedAt ?? null,
    mentionedUserIds: Array.isArray(data.mentionedUserIds) ? data.mentionedUserIds : undefined,
  };
};

/** Live subscription to every thread message across all contacts, tagged with
 * contactId, newest first. The rules allow this only for roles that see every
 * person; a Trainee reads through `subscribeTiedThreads`. Legacy team-scope
 * documents are skipped. */
export function subscribeAllThreads(
  db: Firestore,
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collectionGroup(db, "threads")),
    (snap) => {
      cb(
        snap.docs
          .map((d) => ({
            ...toMessage(d.id, d.data() as Partial<ThreadMessage>),
            contactId: d.ref.parent.parent?.id ?? "",
          }))
          .filter((m) => m.scope !== "team")
          .sort((a, b) => b.at.localeCompare(a.at)),
      );
    },
    (e) => (onError ? onError(e) : console.error("all-threads subscription error", e)),
  );
}

/** A Trainee's thread messages: each visible person's newest, tagged with
 * contactId. Mirrors the web app's src/lib/threads.ts. */
export function subscribeTiedThreads(
  db: Firestore,
  staffId: string,
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return subscribeTiedSubcollection(
    db,
    staffId,
    "threads",
    (docs) => cb(docs.filter((d) => !isLegacyTeam(d.data() as Partial<ThreadMessage>)).map(toMessageWithContact)),
    onError,
  );
}

export interface ThreadNotifyPayload {
  userId: string;
  title: string;
  message: string;
  type: "info";
  targetId: string;
}

/** The stream's last 14 days, to work out who is In the Conversation. A failed
 *  read only narrows who hears; the message itself is already written. */
async function recentInStream(db: Firestore, contactId: string): Promise<ThreadMessageWithContact[]> {
  const since = new Date(Date.now() - IN_THE_CONVERSATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const snap = await getDocs(query(col(db, contactId), where("at", ">=", since)));
    return snap.docs
      .map((d) => ({ ...toMessage(d.id, d.data() as Partial<ThreadMessage>), contactId }))
      .filter((m) => m.scope !== "team");
  } catch {
    return [];
  }
}

/** The message a reply answers: its author hears the reply even after the
 *  14-day window lapses and with no tie (#1640), and the reply may close its
 *  @mention. A failed read only narrows who hears; the reply itself is
 *  already written. */
async function parentOf(
  db: Firestore,
  contactId: string,
  parentId?: string | null,
): Promise<ThreadMessage | null> {
  if (!parentId) return null;
  try {
    const snap = await getDoc(msgRef(db, contactId, parentId));
    return snap.exists() ? toMessage(parentId, (snap.data() ?? {}) as Partial<ThreadMessage>) : null;
  } catch {
    return null;
  }
}

/**
 * Post a new message to a contact. `onNotify`, when given, is called with the
 * bell payload for `notify.to` — each app supplies its own notification write
 * (e.g. mobile's sendNotification) so this module stays free of that side effect.
 */
export async function addThreadMessage(
  db: Firestore,
  contactId: string,
  input: {
    interactionId?: string | null;
    /** A reply in a Thread: the message it answers. */
    parentId?: string | null;
    from: string;
    fromName: string;
    kind: ThreadKind;
    body: string;
    /** Teammates @mentioned, already reconciled against the body (ADR 0007). */
    mentionedUserIds?: string[];
  },
  notify?: {
    to?: string | null;
    contactName?: string;
    stakeholders?: ThreadStakeholders | null;
  },
  onNotify?: (payload: ThreadNotifyPayload) => void,
): Promise<void> {
  const body = input.body.trim();
  const mentionedUserIds = (input.mentionedUserIds ?? []).filter(Boolean);
  const at = new Date().toISOString();
  const created = await addDoc(col(db, contactId), {
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

  // A reply from someone an open @mention names closes it, for everyone it
  // named — the parent, or an earlier mention in the same Thread.
  const parent = await parentOf(db, contactId, input.parentId);
  let recent: ThreadMessageWithContact[] | null = null;
  if (input.parentId && created?.id) {
    recent = await recentInStream(db, contactId);
    const pool = new Map<string, ThreadMessage>(recent.map((m) => [m.id, m]));
    if (parent) pool.set(parent.id, parent);
    const reply = { id: created.id, from: input.from, at, parentId: input.parentId };
    for (const m of mentionsClosedByReply([...pool.values()], reply)) {
      await closeFollowUpAsk(db, contactId, m.id, { uid: input.from, name: input.fromName }).catch(() => undefined);
    }
  }
  if (!onNotify) return;

  const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
  const contactName = notify?.contactName || "this person";
  const message = body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body;
  const notified = new Set<string>();

  // A picked @mention is addressed to that person, so it notifies them with its
  // own title — never the author (ADR 0007).
  for (const uid of mentionedUserIds) {
    if (uid === input.from || notified.has(uid)) continue;
    notified.add(uid);
    onNotify({
      userId: uid,
      title: `${who} mentioned you on ${contactName}`,
      message,
      type: "info",
      targetId: contactId,
    });
  }

  // Everyone tied to the contact, then the legacy single recipient — deduped, so
  // nobody is told twice. Before this, mobile passed only `to`, which
  // `walkingRecipient` leaves null for a Trainee: a Trainee posting from the
  // contact screen notified nobody at all (#813).
  const recipients = new Set(stakeholderUidsOf(notify?.stakeholders, input.from));
  if (notify?.to && notify.to !== input.from) recipients.add(notify.to);
  // And everyone In the Conversation here (#1604): they wrote in this stream in
  // the last 14 days. Not a tie, so a Release does not silence it.
  recent ??= await recentInStream(db, contactId);
  // Writing there once is no access: someone unshared since must not keep
  // reading the person's messages through the bell.
  const canStillSee = (uid: string) => isFullTimer(uid) || !!notify?.stakeholders?.visibleTo?.includes(uid);
  for (const uid of inTheConversation(recent, { ...input, contactId, at })) if (canStillSee(uid)) recipients.add(uid);
  // The author of the message being answered (#1640): a reply reaches them even
  // after the 14-day window lapses and with no tie.
  const parentAuthor = parent?.from || null;
  if (parentAuthor && parentAuthor !== input.from && canStillSee(parentAuthor)) recipients.add(parentAuthor);
  const title = THREAD_NOTIFY_TITLE[input.kind](who, contactName);
  for (const userId of recipients) {
    if (notified.has(userId)) continue;
    onNotify({ userId, title, message, type: "info", targetId: contactId });
  }
}
