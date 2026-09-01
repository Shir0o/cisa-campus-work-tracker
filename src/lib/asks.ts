// "Ask the team" (#545) — a trainee's question that isn't about a person.
//
// "How do I start a conversation at the club table?" has nobody to attach to,
// so it had nowhere to go and got asked in the corridor. Person-less messages
// with the same reply recursion and reactions as threads: asking and reading are
// ONE list and nothing is ever "resolved". No statuses, no resolve button, no FAQ.
//
// Stored at asks/{id} — a top-level collection (like prayerRequests) so the
// full-timer home lists every open question in one subscription while a trainee
// filters to their own. The web app deliberately has no @cisa/core dependency
// (mirroring src/lib/threads.ts), so this is a standalone copy of the shared
// logic in packages/core/src/{asks,data/asks}.ts.
import {
  addDoc,
  collection,
  doc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, sendNotification } from "./firebase";

export type AskKind = "question" | "comment";

export interface AskMessage {
  id: string;
  parentId: string | null; // null = a top-level question; set = an answer to it
  owner: string; // the asker's uid — stamped on every message so a trainee can
  // read their own question AND the replies on it (rules can't follow parentId)
  from: string; // staff uid
  fromName: string;
  takenBy?: string | null; // uid of the full-timer who wrote down the in-person question (#563)
  takenByName?: string | null;
  kind: AskKind;
  body: string;
  at: string; // ISO
  reactions: { by: string; emoji: string }[];
}

const col = () => collection(db, "asks");
const ref = (id: string) => doc(db, "asks", id);

const toAsk = (id: string, data: Partial<AskMessage>): AskMessage => ({
  id,
  parentId: data.parentId ?? null,
  owner: data.owner ?? data.from ?? "",
  from: data.from ?? "",
  fromName: data.fromName ?? "",
  takenBy: data.takenBy ?? null,
  takenByName: data.takenByName ?? null,
  kind: (data.kind as AskKind) ?? "question",
  body: data.body ?? "",
  at: data.at ?? new Date().toISOString(),
  reactions: Array.isArray(data.reactions) ? data.reactions : [],
});

export interface SubscribeAsksOptions {
  uid?: string;
  isStaff?: boolean;
}

/** Live subscription to ask-the-team messages (questions + answers).
 *  Staff (full-timer admin or trainee manager) read the whole collection —
 *  the team's questions are team-visible (#645). Other roles are scoped by
 *  `where("owner", "==", uid)` to satisfy firestore.rules. */
export function subscribeAsks(
  cb: (messages: AskMessage[]) => void,
  onErrorOrOptions?: ((e: unknown) => void) | SubscribeAsksOptions | null,
  options?: SubscribeAsksOptions,
): () => void {
  const onError = typeof onErrorOrOptions === "function" ? onErrorOrOptions : undefined;
  const opts =
    typeof onErrorOrOptions === "object" && onErrorOrOptions !== null
      ? onErrorOrOptions
      : options;

  const isStaff = opts?.isStaff ?? (opts?.uid ? false : true);
  const uid = opts?.uid;

  if (!isStaff && !uid) {
    cb([]);
    return () => {};
  }

  const q = !isStaff && uid ? query(col(), where("owner", "==", uid)) : col();

  try {
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => toAsk(d.id, d.data() as Partial<AskMessage>))),
      (e) => (onError ? onError(e) : console.error("asks subscription error", e)),
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, "asks");
    return () => {};
  }
}

/** Live subscription to the team-wide ask feed for a staff member (a
 *  trainee's view of the whole team's questions + answers). Unfiltered —
 *  staff read everything. */
export function subscribeStaffAsks(
  uid: string,
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return subscribeAsks(cb, onError, { uid, isStaff: true });
}

/** Top-level questions (answers excluded), newest first. */
export function askQuestions(messages: AskMessage[]): AskMessage[] {
  return messages
    .filter((m) => !m.parentId)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** A given user's own top-level questions, newest first. */
export function askQuestionsBy(messages: AskMessage[], uid: string): AskMessage[] {
  return askQuestions(messages).filter((m) => m.from === uid);
}

/** The answers under a question, oldest first. */
export function askRepliesOf(messages: AskMessage[], parentId: string): AskMessage[] {
  return messages
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** Answered = anyone other than the asker has replied. */
export function askAnswered(messages: AskMessage[], m: AskMessage): boolean {
  return messages.some((r) => r.parentId === m.id && r.from !== m.from);
}

/** Whole days since a message was asked (0 = today). */
export function askWaitedDays(m: AskMessage): number {
  return Math.max(0, Math.round((Date.now() - new Date(m.at).getTime()) / 86400000));
}

/** The waiting said in words, not by sliding into an "Earlier" bucket. */
export function askWaitedWords(m: AskMessage): string {
  const d = askWaitedDays(m);
  return d === 0 ? "asked today" : d === 1 ? "waiting since yesterday" : `waiting ${d} days`;
}

export interface AskStack {
  id: string; // "ask:<asker uid>" — one stack per ASKER
  from: string;
  items: AskMessage[];
  at: string;
}

/** The full-timer's side: one stack per asker, unanswered only. */
export function askStacksFor(messages: AskMessage[], uid: string): AskStack[] {
  const byAsker = new Map<string, AskMessage[]>();
  for (const m of askQuestions(messages)) {
    if (m.from === uid || askAnswered(messages, m)) continue;
    if (!byAsker.has(m.from)) byAsker.set(m.from, []);
    byAsker.get(m.from)!.push(m);
  }
  const stacks: AskStack[] = [];
  byAsker.forEach((items, from) => {
    stacks.push({ id: "ask:" + from, from, items, at: items[0].at });
  });
  return stacks.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Who recorded this question in person, if it was asked out loud (#563). */
export function askTakenBy(m: AskMessage): { uid: string; name: string } | null {
  return m.takenBy ? { uid: m.takenBy, name: m.takenByName || m.takenBy } : null;
}

/** Staff (full-timer admin or trainee manager) read every question; other
 *  roles read only their own (#645, team-wide archive). */
export function askVisibleFor(
  messages: AskMessage[],
  uid: string,
  isStaff: boolean,
): AskMessage[] {
  return isStaff ? askQuestions(messages) : askQuestionsBy(messages, uid);
}

/** Unread question count for the Messages channel header row (#563). */
export function askUnreadFor(
  messages: AskMessage[],
  uid: string,
  isFullTimer: boolean,
  isRead: (key: string) => boolean,
): number {
  // Unread semantics differ from visibility: a trainee's unread count is
  // replies on their OWN questions, never other people's threads.
  const mine = isFullTimer ? askQuestions(messages) : askQuestionsBy(messages, uid);
  if (isFullTimer) {
    return mine.filter(
      (m) => m.from !== uid && !askAnswered(messages, m) && !isRead("ask:" + m.id),
    ).length;
  }
  return mine.filter((m) =>
    askRepliesOf(messages, m.id).some((r) => r.from !== uid && !isRead("ask:" + r.id)),
  ).length;
}

export interface AskOriginResult {
  written: boolean;
  pen: { uid: string; name: string } | null;
  icon: "msg" | "edit";
  text: string;
  short: string;
}

/**
 * Origin mark for an ask (#611).
 * Distinguishes whether a trainee asked directly in the app or asked out loud in person
 * and a full-timer recorded it for them.
 */
export function askOrigin(m: AskMessage, viewerId?: string | null): AskOriginResult {
  const pen = askTakenBy(m);
  const mine = Boolean(viewerId && m && m.from === viewerId);

  if (!pen) {
    return {
      written: false,
      pen: null,
      icon: "msg",
      text: mine ? "You asked this here, in your own words" : "Asked here, in their own words",
      short: mine ? "You asked this here" : "Asked here",
    };
  }

  const first = (pen.name || "Someone").trim().split(" ")[0] || "Someone";
  const byWhom = viewerId && pen.uid === viewerId ? "you" : first;

  return {
    written: true,
    pen,
    icon: "edit",
    text: mine
      ? `Asked in person · ${first} wrote it down for you`
      : `Asked in person · written down by ${byWhom}`,
    short: mine ? `${first} wrote it down for you` : `Written down by ${byWhom}`,
  };
}

/** Ask a question. */
export async function addAsk(input: {
  from: string;
  fromName: string;
  body: string;
}): Promise<void> {
  try {
    await addDoc(col(), {
      parentId: null,
      owner: input.from,
      from: input.from,
      fromName: input.fromName,
      kind: "question" as AskKind,
      body: input.body.trim(),
      at: new Date().toISOString(),
      reactions: [],
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "asks");
  }
}

export interface AskForInput {
  askerId: string;
  askerName: string;
  takenBy: string;
  takenByName: string;
  body: string;
}

/** Record a question asked in person (#563) on behalf of a trainee. */
export async function addAskFor(input: AskForInput): Promise<void> {
  const body = input.body.trim();
  try {
    await addDoc(col(), {
      parentId: null,
      owner: input.askerId,
      from: input.askerId,
      fromName: input.askerName,
      takenBy: input.takenBy,
      takenByName: input.takenByName,
      kind: "question" as AskKind,
      body,
      at: new Date().toISOString(),
      reactions: [],
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "asks");
  }
}


/** Answer a question; pings the asker's bell when `notifyTo` is set. */
export async function addAskReply(
  parentId: string,
  input: { from: string; fromName: string; body: string },
  owner: string,
  notifyTo?: string | null,
): Promise<void> {
  const body = input.body.trim();
  try {
    await addDoc(col(), {
      parentId,
      owner,
      from: input.from,
      fromName: input.fromName,
      kind: "comment" as AskKind,
      body,
      at: new Date().toISOString(),
      reactions: [],
    });
    if (notifyTo) {
      const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
      void sendNotification({
        userId: notifyTo,
        title: `${who} answered your question`,
        message: body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body,
        type: "info",
        targetId: parentId,
      });
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, "asks");
  }
}

/** Delete a question and every answer on it, in one batch. A full-timer can
 *  delete anyone's; the asker can delete their own — every message in the
 *  thread (question and answers) carries the asker's `owner`, so the rules
 *  let them take the whole thread down. */
export async function deleteAsk(questionId: string): Promise<void> {
  try {
    const replies = await getDocs(query(col(), where("parentId", "==", questionId)));
    const batch = writeBatch(db);
    replies.forEach((d) => batch.delete(d.ref));
    batch.delete(ref(questionId));
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `asks/${questionId}`);
  }
}

/** Delete a single reply on a question, leaving the question itself in place
 *  (#680). The Firestore rule permits `isAdmin() || existing().owner == uid`
 *  — the asker (who is the reply's `owner` since every reply inherits the
 *  asker's owner) and any full-timer can drop just this one doc. */
export async function deleteAskReply(replyId: string): Promise<void> {
  try {
    await deleteDoc(ref(replyId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `asks/${replyId}`);
  }
}

/** Toggle `by`'s reaction (emoji) on a message. */
export async function toggleAskReaction(
  messageId: string,
  by: string,
  emoji: string,
): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref(messageId));
      if (!snap.exists()) return;
      const reactions = (snap.data().reactions as AskMessage["reactions"]) ?? [];
      const has = reactions.some((r) => r.by === by && r.emoji === emoji);
      const next = has
        ? reactions.filter((r) => !(r.by === by && r.emoji === emoji))
        : [...reactions, { by, emoji }];
      tx.update(ref(messageId), { reactions: next });
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `asks/${messageId}`);
  }
}