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
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  TEAM_THREAD_NOTIFY_TITLE,
  THREAD_NOTIFY_TITLE,
  stakeholderUidsOf,
  type ThreadStakeholders,
  type ThreadKind,
  type ThreadMessage,
  type ThreadMessageWithContact,
} from "../threads";
import { isFullTimer } from "../walking";
import { subscribeTiedSubcollection } from "./contacts";

// The Full-timers stream (`scope: "team"`) lives in its own subcollection, so
// no Trainee's list query can ever reach it (see firestore.rules).
type Scope = "team" | null | undefined;
const sub = (scope: Scope) => (scope === "team" ? "teamThreads" : "threads");
const col = (db: Firestore, contactId: string, scope?: Scope) =>
  collection(db, "contacts", contactId, sub(scope));
const msgRef = (db: Firestore, contactId: string, id: string, scope?: Scope) =>
  doc(db, "contacts", contactId, sub(scope), id);

function toMessage(id: string, data: Partial<ThreadMessage>, team: boolean): ThreadMessage {
  return {
    id,
    interactionId: data.interactionId ?? null,
    parentId: data.parentId ?? null,
    scope: team ? "team" : (data.scope ?? null),
    from: data.from ?? "",
    fromName: data.fromName ?? "",
    kind: (data.kind as ThreadKind) ?? "comment",
    body: data.body ?? "",
    at: data.at ?? new Date().toISOString(),
    closedBy: data.closedBy ?? null,
    closedByName: data.closedByName ?? null,
    closedAt: data.closedAt ?? null,
  };
}

export interface ThreadSubscribeOptions {
  /** Also read the Full-timers stream. Only a Full-timer may: the rules refuse
   *  anyone else the whole listener. */
  includeTeam?: boolean;
}

/** Live subscription to a single contact's thread messages, oldest-first.
 *  Mirrors the web app's src/lib/threads.ts. */
export function subscribeThreads(
  db: Firestore,
  contactId: string,
  cb: (messages: ThreadMessage[]) => void,
  onError?: (e: unknown) => void,
  { includeTeam = false }: ThreadSubscribeOptions = {},
): () => void {
  const scopes: Scope[] = includeTeam ? [null, "team"] : [null];
  const latest: ThreadMessage[][] = scopes.map(() => []);
  const unsubs = scopes.map((scope, i) =>
    onSnapshot(
      query(col(db, contactId, scope), orderBy("at", "asc")),
      (snap) => {
        latest[i] = snap.docs.map((d) => toMessage(d.id, d.data() as Partial<ThreadMessage>, scope === "team"));
        cb(latest.length === 1 ? latest[0] : latest.flat().sort((a, b) => a.at.localeCompare(b.at)));
      },
      (e) => (onError ? onError(e) : console.error("threads subscription error", e)),
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** Delete a single thread message. The Firestore rule permits only the author
 *  or an admin (see firestore.rules), so this mirrors the rule's own gate. */
export async function deleteThreadMessage(
  db: Firestore,
  contactId: string,
  messageId: string,
  scope?: Scope,
): Promise<void> {
  await deleteDoc(msgRef(db, contactId, messageId, scope));
}

/** Close a Follow-up ask as `by`: they followed up, or — when `by` is the
 *  asker — withdrew it ("Never mind"). It closes once, for everyone tied; only
 *  these three keys move (#813). Mirrors the web app's `closeFollowUpAsk`. */
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

const toMessageWithContact = (d: QueryDocumentSnapshot): ThreadMessageWithContact => {
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
  };
};

/** Live subscription to every thread message across all contacts, tagged with
 * contactId. The rules allow this only for roles that see every person; a
 * Trainee reads through `subscribeTiedThreads`. */
export function subscribeAllThreads(
  db: Firestore,
  cb: (messages: ThreadMessageWithContact[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(collectionGroup(db, "threads")),
    (snap) => cb(snap.docs.map(toMessageWithContact)),
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
  return subscribeTiedSubcollection(db, staffId, "threads", (docs) => cb(docs.map(toMessageWithContact)), onError);
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
  input: {
    interactionId?: string | null;
    /** A reply in a Thread: the message it answers. */
    parentId?: string | null;
    /** "team" writes to the Full-timers stream. */
    scope?: "team" | null;
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
  const team = input.scope === "team";
  const mentionedUserIds = (input.mentionedUserIds ?? []).filter(Boolean);
  await addDoc(col(db, contactId, input.scope), {
    interactionId: input.interactionId ?? null,
    parentId: input.parentId ?? null,
    scope: team ? "team" : null,
    from: input.from,
    fromName: input.fromName,
    kind: input.kind,
    body,
    at: new Date().toISOString(),
    ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
  });
  if (!onNotify) return;

  const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
  const contactName = notify?.contactName || "this person";
  const message = body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body;
  const notified = new Set<string>();

  // A picked @mention is addressed to that person, so it notifies them with its
  // own title — and never the author, nor a Trainee about a stream they can't
  // open (ADR 0007).
  for (const uid of mentionedUserIds) {
    if (uid === input.from || notified.has(uid)) continue;
    if (team && !isFullTimer(uid)) continue;
    notified.add(uid);
    onNotify({
      userId: uid,
      title: team
        ? `${who} mentioned you in the Full-timers thread on ${contactName}`
        : `${who} mentioned you on ${contactName}`,
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
  // The Full-timers stream is never announced to a Trainee, and a mention
  // already carried its own buzz.
  if (team) for (const uid of recipients) if (!isFullTimer(uid)) recipients.delete(uid);
  const title = team ? TEAM_THREAD_NOTIFY_TITLE(who, contactName) : THREAD_NOTIFY_TITLE[input.kind](who, contactName);
  for (const userId of recipients) {
    if (notified.has(userId)) continue;
    onNotify({ userId, title, message, type: "info", targetId: contactId });
  }
}
