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
  onSnapshot,
  query,
  runTransaction,
  where,
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

/** Live subscription to every ask-the-team message (full-timers). */
export function subscribeAsks(
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  try {
    return onSnapshot(
      col(),
      (snap) => cb(snap.docs.map((d) => toAsk(d.id, d.data() as Partial<AskMessage>))),
      (e) => (onError ? onError(e) : console.error("asks subscription error", e)),
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, "asks");
    return () => {};
  }
}

/** Live subscription to my own ask-the-team messages (a trainee). */
export function subscribeMyAsks(
  uid: string,
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  try {
    return onSnapshot(
      query(col(), where("owner", "==", uid)),
      (snap) => cb(snap.docs.map((d) => toAsk(d.id, d.data() as Partial<AskMessage>))),
      (e) => (onError ? onError(e) : console.error("my-asks subscription error", e)),
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, "asks (mine)");
    return () => {};
  }
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

/** A full-timer reads every question; anyone else reads their own (#563). */
export function askVisibleFor(
  messages: AskMessage[],
  uid: string,
  isFullTimer: boolean,
): AskMessage[] {
  return isFullTimer ? askQuestions(messages) : askQuestionsBy(messages, uid);
}

/** Unread question count for the Messages channel header row (#563). */
export function askUnreadFor(
  messages: AskMessage[],
  uid: string,
  isFullTimer: boolean,
  isRead: (key: string) => boolean,
): number {
  const mine = askVisibleFor(messages, uid, isFullTimer);
  if (isFullTimer) {
    return mine.filter(
      (m) => m.from !== uid && !askAnswered(messages, m) && !isRead("ask:" + m.id),
    ).length;
  }
  return mine.filter((m) =>
    askRepliesOf(messages, m.id).some((r) => r.from !== uid && !isRead("ask:" + r.id)),
  ).length;
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