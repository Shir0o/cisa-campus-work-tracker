// "Ask the team" (#545) reads/writes — shared Firestore logic behind an
// injected `db`. Lives at asks/{id}: a person-less question (and its answers)
// as message-shaped docs, mirroring threads but with no contact and a
// parentId recursion for answers. A top-level collection (like prayerRequests)
// is what lets the Full-timer home list every open question in one subscription;
// staff (full-timers and trainees) read the whole team's questions team-wide.
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  runTransaction,
  doc,
  deleteDoc,
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
 *  the team's questions are team-visible (#545). Other roles are scoped by
 *  `where("owner", "==", uid)` to satisfy firestore.rules. */
export function subscribeAsks(
  db: Firestore,
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

  const q = !isStaff && uid ? query(col(db), where("owner", "==", uid)) : col(db);

  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => toAsk(d.id, d.data() as Partial<AskMessage>))),
    (e) => (onError ? onError(e) : console.error("asks subscription error", e)),
  );
}

/** Live subscription to the team-wide ask feed for a staff member (a
 *  trainee's view of the whole team's questions + answers). Unfiltered —
 *  staff read everything. */
export function subscribeStaffAsks(
  db: Firestore,
  uid: string,
  cb: (messages: AskMessage[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return subscribeAsks(db, cb, onError, { uid, isStaff: true });
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

export interface AskForInput {
  askerId: string;
  askerName: string;
  takenBy: string;
  takenByName: string;
  body: string;
}

/** Record a question asked in person (#563) on behalf of a trainee. */
export async function addAskFor(
  db: Firestore,
  input: AskForInput,
): Promise<void> {
  await addDoc(col(db), {
    parentId: null,
    owner: input.askerId,
    from: input.askerId,
    fromName: input.askerName,
    takenBy: input.takenBy,
    takenByName: input.takenByName,
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

/** Delete a single reply on a question, leaving the question itself in place
 *  (#680). The Firestore rule permits `isAdmin() || existing().owner == uid`
 *  — the asker (who is the reply's `owner` since every reply inherits the
 *  asker's owner) and any full-timer can drop just this one doc. */
export async function deleteAskReply(
  db: Firestore,
  replyId: string,
): Promise<void> {
  await deleteDoc(ref(db, replyId));
}
