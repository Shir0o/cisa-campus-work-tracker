// The stream model (ADR 0033): one pure function that turns a written stream's
// messages into the ordered things to draw — day dividers, the "New" line, and
// rows flagged as continuations, each carrying its Thread summary and, for a
// Follow-up ask, its state and what this viewer may press.
//
// KEEP IN STEP: this file mirrors packages/core/src/stream.ts (the phone's). The
// web app deliberately takes no @cisa/core dependency (ADR 0033 §6), so the two
// copies cannot share an import; src/test/streamMirrorParity.test.ts runs one
// corpus through both and is the contract between them. Change both, or the
// phone and the web will read the same Conversation differently.

/** The fields every source can supply. `kind` is a contact stream's
 *  ThreadKind; a source without kinds leaves it out. */
export interface StreamMessage {
  id: string;
  parentId?: string | null;
  from: string;
  fromName: string;
  kind?: string | null;
  body: string;
  /** ISO timestamp. */
  at: string;
  closedBy?: string | null;
  closedByName?: string | null;
  closedAt?: string | null;
}

export interface StreamViewer {
  uid: string;
  /** AppRole: 'admin' is a Full-timer, 'manager' a Trainee. */
  role?: string | null;
}

export interface StreamInput<M extends StreamMessage = StreamMessage> {
  messages: M[];
  viewer: StreamViewer;
  now: number | Date;
  /** The viewer's last-read point, where the source has one (chat,
   *  announcements). Contact streams have none and show no New line. */
  lastReadAt?: string | null;
}

export interface StreamDay {
  type: 'day';
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  relative: 'today' | 'yesterday' | 'earlier';
}

export interface StreamNewLine {
  type: 'new';
}

export interface StreamReplier {
  uid: string;
  name: string;
}

/** What a parent's Thread chip says: who replied, how many, and when last. */
export interface ThreadSummary {
  count: number;
  lastReplyAt: string;
  /** Up to three distinct repliers, in the order they first replied. */
  repliers: StreamReplier[];
}

/** A Follow-up ask's state. Closed by its own asker means withdrawn
 *  ("Never mind"); by anyone else, followed up. */
export type AskState =
  | { status: 'open'; /** Local calendar days since it was raised. */ daysOpen: number }
  | { status: 'followedUp'; by: StreamReplier; at: string }
  | { status: 'withdrawn'; by: StreamReplier; at: string };

/** What this viewer may press on an open ask: I followed up (anyone who can
 *  write here) and Never mind (the asker only). */
export type AskAction = 'followedUp' | 'neverMind';

/** The tag beside the author's name. */
export type StreamTag = 'question' | 'ask';

export interface StreamRow<M extends StreamMessage = StreamMessage> {
  type: 'row';
  message: M;
  /** Same author within 5 minutes of their last message, same day: drawn
   *  without avatar or name. */
  continuation: boolean;
  /** null when the message has no replies. */
  thread: ThreadSummary | null;
  tag: StreamTag | null;
  /** null unless the message is a Follow-up ask. */
  ask: AskState | null;
  askActions: AskAction[];
  /** The author or a Full-timer — and never a parent whose replies remain,
   *  so no reply is orphaned. */
  canDelete: boolean;
}

export type StreamItem<M extends StreamMessage = StreamMessage> =
  | StreamDay
  | StreamNewLine
  | StreamRow<M>;

const CONTINUE_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Whole local calendar days from `from` to `to`. */
function calendarDaysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  const a0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((b0 - a0) / DAY_MS);
}

const toMs = (now: number | Date) => (typeof now === 'number' ? now : now.getTime());

const time = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

function byTime<M extends StreamMessage>(list: M[]): M[] {
  return [...list].sort((a, b) => time(a.at) - time(b.at) || a.id.localeCompare(b.id));
}

const tagOf = (m: StreamMessage): StreamTag | null =>
  m.kind === 'question' ? 'question' : m.kind === 'nudge' ? 'ask' : null;

const isFullTimer = (v: StreamViewer) => v.role === 'admin';
/** Operator or above may write — the rules' `isOperator()`. */
const canWrite = (v: StreamViewer) => v.role === 'admin' || v.role === 'manager' || v.role === 'operator';

function askStateOf(m: StreamMessage, nowMs: number): AskState | null {
  if (m.kind !== 'nudge') return null;
  if (!m.closedAt) return { status: 'open', daysOpen: Math.max(0, calendarDaysBetween(time(m.at), nowMs)) };
  const by = { uid: m.closedBy ?? '', name: m.closedByName ?? '' };
  return { status: m.closedBy === m.from ? 'withdrawn' : 'followedUp', by, at: m.closedAt };
}

function askActionsOf(m: StreamMessage, ask: AskState | null, viewer: StreamViewer): AskAction[] {
  if (!ask || ask.status !== 'open' || !canWrite(viewer)) return [];
  return m.from === viewer.uid ? ['followedUp', 'neverMind'] : ['followedUp'];
}

function summarise(replies: StreamMessage[]): ThreadSummary | null {
  if (replies.length === 0) return null;
  const repliers: StreamReplier[] = [];
  for (const r of replies) {
    if (repliers.length === 3) break;
    if (!repliers.some((p) => p.uid === r.from)) repliers.push({ uid: r.from, name: r.fromName });
  }
  return { count: replies.length, lastReplyAt: replies[replies.length - 1].at, repliers };
}

/** Every message's replies, oldest first, keyed by parent id. */
function repliesByParent<M extends StreamMessage>(
  messages: M[],
): Map<string, M[]> {
  const out = new Map<string, M[]>();
  for (const m of byTime(messages)) {
    if (!m.parentId) continue;
    const list = out.get(m.parentId);
    if (list) list.push(m);
    else out.set(m.parentId, [m]);
  }
  return out;
}

/** Lay out a run of messages as rows, flagging continuations. */
function rowsOf<M extends StreamMessage>(
  list: M[],
  replyMap: Map<string, M[]>,
  viewer: StreamViewer,
  nowMs: number,
): StreamRow<M>[] {
  const out: StreamRow<M>[] = [];
  let prev: M | null = null;
  for (const m of list) {
    const t = time(m.at);
    const continuation =
      !!prev &&
      prev.from === m.from &&
      t - time(prev.at) <= CONTINUE_MS &&
      dayKey(time(prev.at)) === dayKey(t) &&
      !tagOf(m);
    const replies = replyMap.get(m.id) ?? [];
    const ask = askStateOf(m, nowMs);
    out.push({
      type: 'row',
      message: m,
      continuation,
      thread: summarise(replies),
      tag: tagOf(m),
      ask,
      askActions: askActionsOf(m, ask, viewer),
      canDelete: (m.from === viewer.uid || isFullTimer(viewer)) && replies.length === 0,
    });
    prev = m;
  }
  return out;
}

export function buildStream<M extends StreamMessage>({
  messages,
  viewer,
  now,
  lastReadAt,
}: StreamInput<M>):
  StreamItem<M>[] {
  const nowMs = toMs(now);
  const top = byTime(messages.filter((m) => !m.parentId));
  // The first message someone else wrote after the last-read point. Your own
  // messages are read by definition.
  const readMs = lastReadAt ? time(lastReadAt) : null;
  const firstUnread =
    readMs === null ? null : top.find((m) => m.from !== viewer.uid && time(m.at) > readMs) ?? null;

  const items: StreamItem<M>[] = [];
  let lastDay: string | null = null;
  for (const row of rowsOf(top, repliesByParent(messages), viewer, nowMs)) {
    const t = time(row.message.at);
    const day = dayKey(t);
    if (day !== lastDay) {
      const diff = calendarDaysBetween(t, nowMs);
      items.push({ type: 'day', day, relative: diff === 0 ? 'today' : diff === 1 ? 'yesterday' : 'earlier' });
      lastDay = day;
    }
    if (row.message === firstUnread) {
      items.push({ type: 'new' });
      // A row under the New line always names its author.
      items.push({ ...row, continuation: false });
      continue;
    }
    items.push(row);
  }
  return items;
}

export interface StreamThread<M extends StreamMessage = StreamMessage> {
  parent: StreamRow<M>;
  /** Oldest first, grouped as the stream is. Replies are one level deep. */
  replies: StreamRow<M>[];
}

/** One message and its replies — what a Thread pane draws. null once the
 *  parent is gone. */
export function buildThread<M extends StreamMessage>(
  { messages, viewer, now }: StreamInput<M>,
  parentId: string,
): StreamThread<M> | null {
  const nowMs = toMs(now);
  const parent = messages.find((m) => m.id === parentId);
  if (!parent) return null;
  const replyMap = repliesByParent(messages);
  const [parentRow] = rowsOf([parent], replyMap, viewer, nowMs);
  return { parent: parentRow, replies: rowsOf(replyMap.get(parentId) ?? [], replyMap, viewer, nowMs) };
}
