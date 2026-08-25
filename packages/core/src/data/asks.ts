// "Ask the team" (#545) reads/writes — shared Firestore logic behind an
// injected `db`. Lives at asks/{id}: a person-less question (and its answers)
// as message-shaped docs, mirroring threads but with no contact and a
// parentId recursion for answers. A top-level collection (like prayerRequests)
// is what lets the Full-timer home list every open question in one subscription
// while a trainee filters to their own.
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  runTransaction,
  doc,
  type Firestore,
} from "firebase/firestore";
import type { AskKind, AskMessage } from "../asks";

const col = (db: Firestore) => collection(db, "asks");
const ref = (db: Firestore, id: string) => doc(db, "asks", id);

const toAsk = (id: string, data: Partial<AskMessage>): AskMessage => ({
  id,
  parentId: data.parentId ?? null,
  owner: data.owner ?? data.from ?? "",
  from: data.from ?? "",
  fromName: data.fromName ?? "",
  kind: (data.kind as AskKind) ?? "question",
  body: data.body ?? "",
  at: data.at ?? new Date().toISOString(),
  reactions: Array.isArray(data.reactions) ? data.reactions : [],
});

/** Live subscription to every ask-the-team message (questions + answers).
 *  Full-timers read all; the rules deny others listing someone else's asks. */
export function subscribeAsks(
  db: Firestore,
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    col(db),
    (snap) => cb(snap.docs.map((d) => toAsk(d.id, d.data() as Partial<AskMessage>))),
    (e) => (onError ? onError(e) : console.error("asks subscription error", e)),
  );
}

/** Live subscription to the ask-the-team messages I own (a trainee's own
 *  questions + their answers). Scoped by `owner` so the list rule passes. */
export function subscribeMyAsks(
  db: Firestore,
  uid: string,
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    query(col(db), where("owner", "==", uid)),
    (snap) => cb(snap.docs.map((d) => toAsk(d.id, d.data() as Partial<AskMessage>))),
    (e) => (onError ? onError(e) : console.error("my-asks subscription error", e)),
  );
}

export interface AskNotifyPayload {
  userId: string;
  title: string;
  message: string;
  type: "info";
  targetId: string;
}

interface AskInput {
  from: string;
  fromName: string;
  body: string;
}

/** Ask a question (parentId null). The asker is the owner of this thread. */
export async function addAsk(
  db: Firestore,
  input: AskInput,
): Promise<void> {
  await addDoc(col(db), {
    parentId: null,
    owner: input.from,
    from: input.from,
    fromName: input.fromName,
    kind: "question" as AskKind,
    body: input.body.trim(),
    at: new Date().toISOString(),
    reactions: [],
  });
}

/** Answer a question. `notifyTo`, when set (the asker's uid), calls `onNotify`
 *  with the bell payload — the first full-timer to reply takes it off every
 *  feed, and only the asker is told. The answer inherits the question's owner
 *  so the asker can read it (rules can't follow parentId). */
export async function addAskReply(
  db: Firestore,
  parentId: string,
  input: AskInput,
  owner: string,
  notifyTo?: string | null,
  onNotify?: (payload: AskNotifyPayload) => void,
): Promise<void> {
  const body = input.body.trim();
  await addDoc(col(db), {
    parentId,
    owner,
    from: input.from,
    fromName: input.fromName,
    kind: "comment" as AskKind,
    body,
    at: new Date().toISOString(),
    reactions: [],
  });
  if (notifyTo && onNotify) {
    const who = (input.fromName || "Someone").trim().split(/\s+/)[0];
    onNotify({
      userId: notifyTo,
      title: `${who} answered your question`,
      message: body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body,
      type: "info",
      targetId: parentId,
    });
  }
}

/** Toggle `by`'s reaction (emoji) on a message. */
export async function toggleAskReaction(
  db: Firestore,
  messageId: string,
  by: string,
  emoji: string,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref(db, messageId));
    if (!snap.exists()) return;
    const reactions = (snap.data().reactions as AskMessage["reactions"]) ?? [];
    const has = reactions.some((r) => r.by === by && r.emoji === emoji);
    const next = has
      ? reactions.filter((r) => !(r.by === by && r.emoji === emoji))
      : [...reactions, { by, emoji }];
    tx.update(ref(db, messageId), { reactions: next });
  });
}