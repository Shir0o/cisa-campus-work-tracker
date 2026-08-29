// "Ask the team" (#545) — a question that isn't about a person.
//
// "How do I start a conversation at the club table?" has nobody to attach to,
// so it had nowhere to go and got asked in the corridor. These are person-less
// messages: the same reply recursion and reactions as threads, but with no
// contact, so the asking and the reading are ONE list and nothing is ever
// "resolved" — a question with a reply is just a question with a reply. No
// statuses, no resolve button, no FAQ, no topics.
//
// This is the PURE subset shared across platforms. The Firestore CRUD +
// subscription (`subscribeAsks`, `addAsk`, `addAskReply`, `toggleAskReaction`)
// lives in `./data/asks.ts` behind an injected `db`, mirroring threads.ts.

import type { ThreadReaction } from "./threads";

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
  reactions: ThreadReaction[];
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

/** The answers under a question, oldest first (the design's parentId recursion). */
export function askRepliesOf(messages: AskMessage[], parentId: string): AskMessage[] {
  return messages
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** Answered = anyone other than the asker has replied. The first full-timer to
 *  reply takes it off every other full-timer's feed. */
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
  id: string; // "ask:<asker uid>" — one stack per ASKER, since a question has no person
  from: string;
  items: AskMessage[]; // unanswered questions from that asker, newest first
  at: string; // ISO of the newest question
}

/** The full-timer's side: one stack per asker, unanswered only. An unanswered
 *  question does NOT age out of the feed — it sits at the top until someone
 *  replies. Callers mark per-question read state (e.g. `ask:<id>` in InboxReads),
 *  so `unread` is computed by the surface, not here. */
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
 *  roles read only their own (#545, team-wide archive). */
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