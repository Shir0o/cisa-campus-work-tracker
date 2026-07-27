// Mobile v2 — the FULL-TIMER's home. PURE derivations, ported from the Claude
// Design project's `views/mobile/ft.jsx` (direction 05 "Widgets"). Not the
// trainee's focus queue: an at-a-glance scroll on a warm paper room.
//
// Same split as queue.ts — the Firestore subscriptions and writes stay in each
// app's data layer; this is the behavior oracle, and the only part of the FT
// home that carries automated tests (apps/mobile has none by convention).
//
// THREE SUBSTITUTIONS the prototype's mock data allowed and this schema doesn't:
//   1. `HUDDLE_NEXT` (a mock "team prayer" with a time) has no equivalent here,
//      and `Event` has no time-of-day field at all. `ftNextGathering` reads the
//      next upcoming event instead, and the tile says "Next gathering".
//   2. There is no priority/weight on a prayer, so "weighs heavy" is
//      `status === "ongoing"` — the schema's own "still being carried" signal.
//   3. The prototype's fix note says the stage label field is `name`; here it is
//      the inverse. `Stage` is `{ id, label, … }` and `Contact.stage` stores the
//      LABEL string, so a row renders `contact.stage` with no lookup.
import { format } from "date-fns";
import type { InboxItem } from "./inbox";
import { DAY_MS, parseMs, toLocalDate, type Leader } from "./myday";
import { dueInDays } from "./queue";
import { firstName } from "./history";
import type { Contact, Event, PrayerRecord, Task } from "./types";

/** A person is "gone quiet" once this many days have passed since a touch. */
export const FT_QUIET_DAYS = 10;
/** Rows a widget shows before its section-head link takes over. */
export const FT_WIDGET_ROWS = 3;
/** Rows "From the team" grows to once expanded. */
export const FT_INBOX_EXPANDED = 12;
/** Chips in the week-ahead strip. */
export const FT_WEEK_CHIPS = 5;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ── the header's honest summary line ───────────────────────────────────────

export interface FtSummaryCounts {
  /** To-dos due today or overdue. */
  needsYou: number;
  /** UNREAD items in the team inbox. */
  fromTeam: number;
  /** Everyone gone quiet — the full set, not the three the widget shows. */
  quiet: number;
}

export const FT_SUMMARY_EMPTY =
  "Nothing is waiting on you. A good day to just be with people.";

/** "3 things need you today · 2 from the team · 1 person gone quiet." */
export function ftSummaryLine(counts: FtSummaryCounts): string {
  const parts: string[] = [];
  if (counts.needsYou > 0) {
    parts.push(
      `${counts.needsYou} ${plural(counts.needsYou, "thing needs", "things need")} you today`,
    );
  }
  if (counts.fromTeam > 0) parts.push(`${counts.fromTeam} from the team`);
  if (counts.quiet > 0) {
    parts.push(`${counts.quiet} ${plural(counts.quiet, "person", "people")} gone quiet`);
  }
  return parts.length ? parts.join(" · ") + "." : FT_SUMMARY_EMPTY;
}

// ── "Needs you today" ──────────────────────────────────────────────────────

export interface FtTodoSplit {
  /** Overdue or due today — overdue first, then due-date ascending. */
  today: Task[];
  /** Due in the next 1–6 days; the count behind the section-head link. */
  laterThisWeek: Task[];
}

/** Active to-dos assigned to `uid`, split by whether they are owed today.
 *  Undated to-dos belong to neither group: this widget is about promises with a
 *  date on them, and the rest live on The Board. */
export function ftTodos(tasks: Task[], uid: string, now: number = Date.now()): FtTodoSplit {
  const today: { t: Task; d: number }[] = [];
  const laterThisWeek: { t: Task; d: number }[] = [];
  for (const t of tasks) {
    if (t.assigneeId !== uid) continue;
    if (t.status === "completed" || t.status === "canceled") continue;
    const d = dueInDays(t.dueDate, now);
    if (d == null) continue;
    if (d <= 0) today.push({ t, d });
    else if (d < 7) laterThisWeek.push({ t, d });
  }
  const byDue = (a: { d: number }, b: { d: number }) => a.d - b.d;
  return {
    today: today.sort(byDue).map((x) => x.t),
    laterThisWeek: laterThisWeek.sort(byDue).map((x) => x.t),
  };
}

// ── "From the team" ────────────────────────────────────────────────────────

export interface FtInboxRow {
  item: InboxItem;
  /** The teammate's first name. */
  who: string;
  headline: string;
  sub: string;
  /** Which reply the row offers. */
  reply: "write-back" | "encourage";
  /** The thread kind that reply posts. */
  replyKind: "comment" | "encouragement";
  unread: boolean;
}

/** Turn the raw inbox feed into rendered lines. `items` is already newest-first
 *  (inboxItemsFor sorts it), and that order is preserved. */
export function ftInboxRows(
  items: InboxItem[],
  ctx: {
    contacts: Contact[];
    nameByUid: Record<string, string>;
    isRead: (id: string) => boolean;
  },
): FtInboxRow[] {
  const byId = new Map(ctx.contacts.map((c) => [c.id, c]));
  return items.map((item) => {
    const who = firstName(ctx.nameByUid[item.by] || "");
    const name = firstName(byId.get(item.contactId)?.name || "someone new");
    const isThread = item.type === "thread";
    return {
      item,
      who,
      headline:
        item.type === "contact"
          ? `${who} brought in ${name}`
          : item.type === "interaction"
            ? `${who} logged time with ${name}`
            : `${who} asked you something about ${name}`,
      sub:
        item.type === "contact"
          ? item.reviewed
            ? "You've had a look"
            : "Waiting on a look from you"
          : item.body || "",
      reply: isThread ? "write-back" : "encourage",
      replyKind: isThread ? "comment" : "encouragement",
      unread: !ctx.isRead(item.id),
    };
  });
}

/** What the widget actually shows: the unread rows if there are any, else the
 *  newest few — and everything (to a cap) once the reader expands it. */
export function ftInboxVisible(rows: FtInboxRow[], expanded: boolean): FtInboxRow[] {
  if (expanded) return rows.slice(0, FT_INBOX_EXPANDED);
  const unread = rows.filter((r) => r.unread);
  return (unread.length ? unread : rows).slice(0, FT_WIDGET_ROWS);
}

// ── "Gone quiet in your care" ──────────────────────────────────────────────

/** People in my care I haven't heard from in a while. `leaders` comes from
 *  `deriveLeaders`, already longest-since-connected first. Contacts with no
 *  touch AND no createdAt carry `Infinity` days — that's missing data, not
 *  silence, so they're dropped rather than shouted about. */
export function ftGoneQuiet(leaders: Leader[], minDays: number = FT_QUIET_DAYS): Leader[] {
  return leaders.filter((l) => Number.isFinite(l.days) && l.days >= minDays);
}

/** "today" / "yesterday" / "12 days ago" from a DAY COUNT.
 *
 *  `daysAgoWords` takes an ISO string; `deriveLeaders` yields a number. Handing
 *  one to the other is exactly the bug the design's Jul 26 revision called out
 *  (it printed "20661 days ago"), so this is the number-shaped sibling. */
export function ftLastHeard(days: number): string {
  if (!Number.isFinite(days)) return "a while ago";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

// ── "Prayers to carry" + the Carrying tile ─────────────────────────────────

/** No priority field exists on a prayer — "ongoing" is the schema's own signal
 *  that something is still being carried, so it stands in for "weighs heavy". */
export const ftWeighsHeavy = (p: PrayerRecord): boolean => p.status === "ongoing";

/** Open prayers, heaviest first, then newest. Matches buildQueue's own filter. */
export function ftOpenPrayers(prayers: PrayerRecord[]): PrayerRecord[] {
  return prayers
    .filter((p) => p.status === "pending" || p.status === "ongoing")
    .sort(
      (a, b) =>
        Number(ftWeighsHeavy(b)) - Number(ftWeighsHeavy(a)) ||
        (parseMs(b.date) ?? 0) - (parseMs(a.date) ?? 0),
    );
}

export interface FtCarrying {
  count: number;
  /** "Rio — a job before graduation", or the empty line. */
  detail: string;
}

export function ftCarrying(open: PrayerRecord[], contacts: Contact[]): FtCarrying {
  const top = open[0];
  if (!top) return { count: 0, detail: "Nothing open right now" };
  const c = contacts.find((x) => x.id === top.contactId);
  return {
    count: open.length,
    detail: c ? `${firstName(c.name)} — ${top.burden}` : top.burden,
  };
}

// ── the calendar: the glance tile and the week-ahead strip ─────────────────

/** "Today" / "Tomorrow" / "Thursday". Goes through `toLocalDate`, never
 *  `parseMs`: an `Event.date` is a bare `yyyy-MM-dd`, which `new Date()` reads
 *  as UTC midnight — a day early everywhere behind UTC. */
function whenWord(date: string, now: number): string {
  const d = dueInDays(date, now);
  if (d != null && d <= 0) return "Today";
  if (d === 1) return "Tomorrow";
  const local = toLocalDate(date);
  return local ? format(local, "EEEE") : "";
}

/** Events dated from today through the next 7 days, soonest first. Deliberately
 *  wider than `queueDates` (which is one-off specials only): a full-timer's week
 *  is mostly the recurring gatherings, and the recurrence generator materialises
 *  those as real dated docs. */
function upcoming(events: Event[], now: number): Event[] {
  const horizon = now + 7 * DAY_MS;
  return events
    .map((ev) => ({ ev, ms: toLocalDate(ev.date)?.getTime() ?? null }))
    .filter((x): x is { ev: Event; ms: number } => x.ms != null)
    .filter((x) => (dueInDays(x.ev.date, now) ?? -99) >= 0 && x.ms <= horizon)
    .sort((a, b) => a.ms - b.ms || (a.ev.order ?? 0) - (b.ev.order ?? 0))
    .map((x) => x.ev);
}

export interface FtNextGathering {
  id: string;
  /** "Today" / "Tomorrow" / a weekday — the tile's big value. */
  when: string;
  title: string;
  detail: string;
}

/** The next gathering on the calendar, or null when the week is empty.
 *  Stands in for the prototype's `HUDDLE_NEXT`: nothing in this schema marks a
 *  gathering as the team's prayer, and `Event` carries no time of day. */
export function ftNextGathering(
  events: Event[],
  now: number = Date.now(),
): FtNextGathering | null {
  const ev = upcoming(events, now)[0];
  if (!ev) return null;
  return {
    id: ev.id,
    when: whenWord(ev.date, now),
    title: ev.name,
    detail: ev.location || "No location set",
  };
}

export interface FtWeekChip {
  id: string;
  when: string;
  title: string;
  sub: string;
}

export function ftWeekAhead(events: Event[], now: number = Date.now()): FtWeekChip[] {
  return upcoming(events, now)
    .slice(0, FT_WEEK_CHIPS)
    .map((ev) => ({
      id: ev.id,
      when: whenWord(ev.date, now),
      title: ev.name,
      sub: [ev.type, ev.location].filter(Boolean).join(" · "),
    }));
}
