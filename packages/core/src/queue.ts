// Mobile v2 — the focus queue. PURE derivation, ported from the Claude Design
// project's views/mobile/queue.jsx (`buildM2Queue`) with its mock stores swapped
// for the real schema in types.ts.
//
// The product idea (locked, see MOBILE-V2.md there): mobile is a full-screen
// focus queue for the trainee, not a dashboard. One actionable card at a time,
// "Later" re-queues to the end, and the queue ENDS. No metrics, no infinite
// scroll, no recurring gatherings.
//
// Subscriptions and writes stay in each app's data layer; this is the behavior
// oracle, so it stays trivially testable (see test/queue.test.ts).
import { DAY_MS, daysSince, parseMs } from "./myday";
import { traineeMyPeople } from "./landing";
import { firstName } from "./history";
import type { Contact, Event, Interaction, PrayerRecord, Task } from "./types";
import type { ThreadKind, ThreadMessageWithContact } from "./threads";

export type QueueKind = "due" | "msg" | "follow" | "quiet" | "pray";
export type QueueTone = "due" | "ask" | "follow" | "pray" | "note";

export interface QueueCard {
  /** Stable across rebuilds — the handled/later store keys off it. */
  id: string;
  kind: QueueKind;
  tone: QueueTone;
  /** 0 due · 1 messages from your full-timer · 2 follow-ups / quiet · 3 prayers */
  group: 0 | 1 | 2 | 3;
  /** The tone-pill label. */
  label: string;
  /** The quiet trailing phrase on the pill. */
  ago: string;
  /** One-line summary, used by the "Everything today" list. */
  title: string;
  contact?: Contact;
  task?: Task;
  msg?: ThreadMessageWithContact;
  prayer?: PrayerRecord;
  /** The most recent logged conversation with this person, if any. */
  last?: Interaction | null;
}

/** The list, plus how many were held back by the day cap. */
export interface Queue extends Array<QueueCard> {
  held: number;
}

export interface QueuePrefs {
  /** Days of silence before someone counts as "gone quiet". */
  quietDays: number;
  /** How many quiet people to surface at a time. */
  quietMax: number;
  /** How many prayers to carry in a day. */
  prayers: number;
  /** How much a day holds. 0 = no cap. */
  dayCap: number;
}

// Ported from M2_PREF_DEFAULTS. The v2 Settings screen makes these the trainee's
// own call; until it lands, everyone gets these.
export const QUEUE_PREF_DEFAULTS: QueuePrefs = {
  quietDays: 2,
  quietMax: 2,
  prayers: 3,
  dayCap: 8,
};

/** Kinds of message from your full-timer that earn a card. */
const MSG_KINDS: ThreadKind[] = ["question", "comment", "nudge", "encouragement"];

const MSG_LABEL: Record<string, (name: string) => string> = {
  question: (n) => `${n} asked you something`,
  comment: (n) => `${n} wrote back`,
  nudge: (n) => `${n} nudged you`,
  encouragement: (n) => `${n} encouraged you`,
  note: (n) => `A note from ${n}`,
};

// ── small text helpers (ported verbatim in spirit from queue.jsx) ───────────

// A stable warm colour per person, from the v2 palette. Same hash as the
// prototype's m2Color so a person keeps their colour across the port.
const PERSON_TONES = ["#c9622f", "#2b4a6e", "#8d7aa8", "#6c8f6f", "#a8763a", "#7a6a5c"];

export function personColor(id?: string | null): string {
  let h = 0;
  for (const ch of id || "") h = (h * 31 + ch.charCodeAt(0)) % 997;
  return PERSON_TONES[h % PERSON_TONES.length];
}

/** Whole days from today to `iso`. Negative = in the past. */
export function dueInDays(iso?: string | null, now: number = Date.now()): number | null {
  const ms = parseMs(iso);
  if (ms == null) return null;
  const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  return Math.round((startOf(ms) - startOf(now)) / DAY_MS);
}

export function daysAgoWords(iso?: string | null, now: number = Date.now()): string {
  const d = dueInDays(iso, now);
  if (d == null) return "";
  const ago = -d;
  if (ago <= 0) return "today";
  if (ago === 1) return "yesterday";
  return `${ago} days ago`;
}

const VERB: Record<string, string> = {
  phone: "called",
  text: "texted",
  coffee: "had coffee",
  meal: "shared a meal",
  meet: "met",
  meeting: "met",
  "small-group": "were in group",
  gathering: "were at gathering",
  rehearsal: "rehearsed",
};

/** "texted 3 days ago" — the line under a follow-up. */
export function agoPhrase(i?: Interaction | null, now: number = Date.now()): string {
  if (!i) return "";
  return `${VERB[i.type || ""] || "talked"} ${daysAgoWords(i.dateTime, now)}`;
}

/** "Sophomore · Biology · Hillcrest" — who someone is, without an ID in sight. */
export function personSubLine(c: Contact): string {
  return [c.year, c.major, c.location && c.location !== "off-campus" ? c.location : null]
    .filter(Boolean)
    .join(" · ");
}

/** Conversations with a person, newest first. */
export function conversationsWith(interactions: Interaction[], contactId: string): Interaction[] {
  return interactions
    .filter((i) => i.contactId === contactId)
    .sort((a, b) => (parseMs(b.dateTime) ?? 0) - (parseMs(a.dateTime) ?? 0));
}

// ── the queue ──────────────────────────────────────────────────────────────

export interface QueueInput {
  uid: string;
  /** The full-timer who cares for this trainee, if any. */
  fullTimer?: string | null;
  contacts: Contact[];
  tasks: Task[];
  threads: ThreadMessageWithContact[];
  interactions: Interaction[];
  /** Prayers on the trainee's own people (splitPrayers' `contactPrayers`, which
   * still includes answered ones — buildQueue keeps only the open ones). */
  prayers: PrayerRecord[];
  /** Has this message already been acknowledged? Keyed `thread:<id>`. */
  isRead: (id: string) => boolean;
  /** Cards already dealt with today → `{id: timestamp}`. */
  handled: Record<string, number>;
  /** Cards pushed to the end today → `{id: timestamp}`. */
  later: Record<string, number>;
  now?: number;
}

const isDone = (t: Task) => t.status === "completed" || t.status === "canceled";

export function buildQueue(input: QueueInput, prefs: QueuePrefs = QUEUE_PREF_DEFAULTS): Queue {
  const now = input.now ?? Date.now();
  const byId = new Map(input.contacts.map((c) => [c.id, c] as const));
  const out: QueueCard[] = [];

  const lastWith = (contactId: string) => conversationsWith(input.interactions, contactId)[0] ?? null;

  // 1 — to-dos off The Board, due now. Group 0: a promise with your name on it.
  for (const t of input.tasks) {
    if (t.assigneeId !== input.uid || isDone(t)) continue;
    const d = dueInDays(t.dueDate, now);
    if (d == null || d > 1) continue;
    out.push({
      id: "todo:" + t.id,
      kind: "due",
      tone: "due",
      group: 0,
      label: d < 0 ? "Overdue" : d === 0 ? "Due today" : "Due tomorrow",
      ago: t.sourceDocTitle ? "from " + t.sourceDocTitle : "from The Board",
      title: t.title,
      task: t,
      contact: t.contactId ? byId.get(t.contactId) : undefined,
    });
  }

  // 2 — anything the full-timer who cares for you sent, still unacknowledged.
  if (input.fullTimer) {
    const mine = input.threads
      .filter(
        (m) =>
          m.from === input.fullTimer &&
          MSG_KINDS.includes(m.kind) &&
          !input.isRead("thread:" + m.id),
      )
      .sort((a, b) => (parseMs(b.at) ?? 0) - (parseMs(a.at) ?? 0));
    const ftName = firstName(
      input.threads.find((m) => m.from === input.fullTimer)?.fromName ?? "your full-timer",
    );
    for (const m of mine) {
      out.push({
        id: "ftmsg:" + m.id,
        kind: "msg",
        tone: "ask",
        group: 1,
        label: (MSG_LABEL[m.kind] || MSG_LABEL.note)(ftName),
        ago: daysAgoWords(m.at, now),
        title: `${ftName}: ${m.body.slice(0, 60)}`,
        msg: m,
        contact: byId.get(m.contactId),
      });
    }
  }

  // 3 — follow-ups you promised (a to-do with a person attached).
  const promised = new Set<string>();
  for (const t of input.tasks) {
    if (t.assigneeId !== input.uid || isDone(t) || !t.contactId) continue;
    const c = byId.get(t.contactId);
    if (!c) continue;
    // A due to-do already has a card in group 0; don't say the same thing twice.
    const d = dueInDays(t.dueDate, now);
    if (d != null && d <= 1) continue;
    promised.add(c.id);
    const last = lastWith(c.id);
    out.push({
      id: "task:" + t.id,
      kind: "follow",
      tone: "follow",
      group: 2,
      label: "You said you'd follow up",
      ago: last ? agoPhrase(last, now) : "",
      title: t.title,
      task: t,
      contact: c,
      last,
    });
  }

  // 4 — people of yours who've gone quiet.
  const quiet = traineeMyPeople(input.contacts, input.uid, now)
    .filter((p) => p.days >= prefs.quietDays && !promised.has(p.contact.id))
    .slice(0, prefs.quietMax);
  for (const p of quiet) {
    const days = Number.isFinite(p.days) ? p.days : 0;
    out.push({
      id: "quiet:" + p.contact.id,
      kind: "quiet",
      tone: "follow",
      group: 2,
      label: "It's gone quiet",
      ago: `${days} ${days === 1 ? "day" : "days"} quiet`,
      title: `${firstName(p.contact.name)} hasn't heard from you in ${days} days`,
      contact: p.contact,
      last: lastWith(p.contact.id),
    });
  }

  // 5 — prayers to carry. Only the open ones: an answered prayer belongs on the
  // Answered wall, not in the queue.
  const openPrayers = input.prayers
    .filter((p) => p.status === "pending" || p.status === "ongoing")
    .sort((a, b) => (parseMs(b.date) ?? 0) - (parseMs(a.date) ?? 0))
    .slice(0, prefs.prayers);
  for (const p of openPrayers) {
    const c = byId.get(p.contactId);
    out.push({
      id: "pray:" + p.id,
      kind: "pray",
      tone: "pray",
      group: 3,
      label: c ? "Pray for " + firstName(c.name) : "A prayer to carry",
      ago: "added " + daysAgoWords(p.date, now),
      title: p.burden,
      prayer: p,
      contact: c,
    });
  }

  // Handled cards are gone for the day; "Later" cards go to the back, in the
  // order they were deferred. Everything else falls in group order.
  const list = out
    .filter((x) => !input.handled[x.id])
    .sort((a, b) => {
      const la = input.later[a.id] || 0;
      const lb = input.later[b.id] || 0;
      if (!!la !== !!lb) return la ? 1 : -1;
      if (la && lb) return la - lb;
      return a.group - b.group;
    });

  // How much lands in one day is the trainee's call. Anything past the cap waits
  // for tomorrow — EXCEPT group 0: a to-do that is actually due is a promise and
  // is never held back. `held` rides on the array so the screens can say honestly
  // how many are waiting.
  const cap = prefs.dayCap || 0;
  if (cap && list.length > cap) {
    const keep: QueueCard[] = [];
    let held = 0;
    list.forEach((x, i) => {
      if (i < cap || x.group === 0) keep.push(x);
      else held += 1;
    });
    return Object.assign(keep, { held });
  }
  return Object.assign(list, { held: 0 });
}

// ── the end of the queue ───────────────────────────────────────────────────

export interface QueueDate {
  id: string;
  date: string;
  title: string;
  sub: string;
}

/** One-off dates worth knowing — end of queue only. Recurring gatherings never
 * appear on mobile v2. */
export function queueDates(events: Event[], now: number = Date.now()): QueueDate[] {
  return events
    .filter((e) => !e.isRecurring && !e.parentEventId)
    .filter((e) => /special|outreach|retreat/i.test(e.type || ""))
    .filter((e) => (parseMs(e.date) ?? 0) >= now - DAY_MS)
    .sort((a, b) => (parseMs(a.date) ?? 0) - (parseMs(b.date) ?? 0))
    .slice(0, 4)
    .map((e) => ({
      id: e.id,
      date: e.date,
      title: e.name,
      sub: [e.type, e.location].filter(Boolean).join(" · "),
    }));
}

/** What you logged this week — the "look back at your week" block. */
export function queueWeek(
  interactions: Interaction[],
  uid: string,
  now: number = Date.now(),
): Interaction[] {
  const since = now - 7 * DAY_MS;
  return interactions
    .filter((i) => (i.userId ?? i.createdById) === uid)
    .filter((i) => (parseMs(i.dateTime) ?? 0) >= since)
    .sort((a, b) => (parseMs(b.dateTime) ?? 0) - (parseMs(a.dateTime) ?? 0));
}

// ── the on-campus window ───────────────────────────────────────────────────

export interface OnCampusWindow {
  /** Weekday numbers (0 = Sunday). Default Tue & Wed. */
  days: number[];
  from: number;
  to: number;
}

export const ON_CAMPUS_DEFAULT: OnCampusWindow = { days: [2, 3], from: 12, to: 15 };

/** Are we inside the on-campus window right now? Logging gets promoted hard
 * during it (the terracotta strip at the top of the card). */
export function isOnCampus(w: OnCampusWindow = ON_CAMPUS_DEFAULT, now: number = Date.now()): boolean {
  const d = new Date(now);
  return w.days.includes(d.getDay()) && d.getHours() >= w.from && d.getHours() < w.to;
}

/** Days since someone was last seen — the number behind "N days quiet". */
export const quietDaysFor = (c: Contact, now: number = Date.now()): number => {
  const ms = parseMs(c.lastSeen) ?? parseMs(c.createdAt);
  return ms == null ? 0 : daysSince(ms, now);
};
