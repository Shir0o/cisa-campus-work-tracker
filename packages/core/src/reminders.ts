// Reminder rule (#1289): which Follow-up ask or question is due its one
// reminder at a tick. Pure — a fixed clock in, the bell entries due out — so
// the scheduled function stays a thin writer and this is the behaviour oracle.
//
// A **Follow-up ask** still open three campus calendar days after it was raised,
// and a **question** with no reply in its Thread after the same three days, each
// tell the asker once — "nobody followed up" — and never anyone else. The asker
// is the only recipient on purpose: a reminder that made the errand someone
// else's would hand out the obligation the Follow-up ask exists to avoid.
//
// "Three calendar days" is three days on the campus clock
// (`America/Los_Angeles`), not three 24-hour periods: raised late on the eve of
// a daylight-saving change, it is still due on the third day.

export const CAMPUS_TIME_ZONE = "America/Los_Angeles";
export const REMIND_AFTER_CALENDAR_DAYS = 3;

const DAY_MS = 86_400_000;

export type ReminderKind = "ask" | "question";

export interface ReminderReply {
  from: string;
  at: string;
}

export interface ReminderCandidate {
  contactId: string;
  messageId: string;
  kind: ReminderKind;
  /** The asker's uid — the one and only recipient. */
  from: string;
  body: string;
  /** ISO timestamp the ask or question was raised. */
  at: string;
  /** Follow-up asks only: set once someone followed up or the asker withdrew. */
  closedAt?: string | null;
  /** Set once this ask or question has been reminded; it is never reminded twice. */
  remindedAt?: string | null;
  /** A question's Thread replies, oldest first. */
  replies?: ReminderReply[];
}

export interface ReminderNotification {
  userId: string;
  title: string;
  message: string;
  type: "info";
  targetId: string;
  link: string;
}

export interface DueReminder {
  notification: ReminderNotification;
  source: { contactId: string; messageId: string };
}

/** Whole campus calendar days from `atIso` to `now` (0 = today). */
export function campusCalendarDaysSince(atIso: string, now: number | Date): number {
  const from = campusDayNumber(new Date(atIso).getTime());
  const to = campusDayNumber(typeof now === "number" ? now : now.getTime());
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, to - from);
}

function campusDayNumber(ms: number): number {
  if (Number.isNaN(ms)) return NaN;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY_MS;
}

const excerpt = (body: string) =>
  body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body;

function isDue(c: ReminderCandidate, now: number | Date): boolean {
  if (c.remindedAt) return false;
  if (c.kind === "ask" && c.closedAt) return false;
  if (c.kind === "question" && (c.replies ?? []).some((r) => r.from !== c.from)) return false;
  return campusCalendarDaysSince(c.at, now) >= REMIND_AFTER_CALENDAR_DAYS;
}

/**
 * The reminder bell entries due at `now`. One per ask or question, addressed to
 * its asker, carrying the source doc the scheduled function marks reminded.
 */
export function remindersDue(candidates: ReminderCandidate[], now: number | Date): DueReminder[] {
  const due: DueReminder[] = [];
  for (const c of candidates) {
    if (!isDue(c, now)) continue;
    due.push({
      notification: {
        userId: c.from,
        title: c.kind === "ask" ? "Nobody followed up" : "No reply yet on your question",
        message: excerpt(c.body),
        type: "info",
        targetId: c.contactId,
        link: `/people/${c.contactId}?tab=thread`,
      },
      source: { contactId: c.contactId, messageId: c.messageId },
    });
  }
  return due;
}

// ── Weekly reminders (#1301) ────────────────────────────────────────────────
// The rhythm reminders: a Full-timer hears how many people are waiting to work
// through on Around the team, and a Trainee hears what is waiting on their own
// people. Both go out only when something is waiting, on the campus clock, and
// only to the people the stored schedule names. This is the same pure-rule
// shape as `remindersDue` above: a fixed clock and plain inputs in, the bell
// entries due out.

/** A campus weekday, `0` = Sunday … `6` = Saturday (JS `getDay` order). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ReminderTime {
  /** The campus weekdays this reminder goes out. Empty means never. */
  days: Weekday[];
  /** The campus hour (0–23) it goes out. */
  hour: number;
}

export interface ReminderSchedule {
  fullTimers: ReminderTime;
  /** One schedule per team, keyed by team id. A team with no entry gets none. */
  teams: Record<string, ReminderTime>;
}

/** The defaults the schedule document starts from: Full-timers Tuesday and
 *  Wednesday at 5 pm; YP Tuesday at 6 pm; Campus Tuesday and Wednesday at 6 pm. */
export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = {
  fullTimers: { days: [2, 3], hour: 17 },
  teams: { yp: { days: [2], hour: 18 }, campus: { days: [2, 3], hour: 18 } },
};

/** One staff member the weekly rule reads: their role and team, whether they
 *  turned their own reminders off, what is waiting for them, and the last time
 *  they were reminded (so a retry never sends twice in a day). */
export interface WeeklyReminderStaff {
  uid: string;
  /** An AppRole. Only `admin` (Full-timer) and `manager` (Trainee) are reminded. */
  role: string;
  team?: string | null;
  weeklyRemindersOff?: boolean;
  /** Full-timers: the Around the team cards still to work through. */
  toWorkThrough?: number;
  /** Trainees: their own people nobody has reached yet. */
  notReachedYet?: number;
  /** Trainees: open Follow-up asks on their own people. */
  openAsks?: number;
  /** The last weekly reminder sent to them, ISO. */
  lastWeeklyReminderAt?: string | null;
}

export interface DueWeeklyReminder {
  uid: string;
  notification: ReminderNotification;
}

/** The campus weekday and hour at `now`. */
export function campusWeekdayHour(now: number | Date | string): { weekday: number; hour: number } {
  const ms = typeof now === "number" ? now : new Date(now).getTime();
  if (Number.isNaN(ms)) return { weekday: -1, hour: -1 };
  // 1970-01-01 (day 0) was a Thursday (JS getDay 4).
  const weekday = (((campusDayNumber(ms) % 7) + 7 + 4) % 7);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return { weekday, hour };
}

export function aroundTeamReminderMessage(count: number): string {
  return count === 1
    ? "1 new person to work through on Around the team"
    : `${count} new people to work through on Around the team`;
}

export function traineeReminderMessage(notReachedYet: number, openAsks: number): string {
  const parts: string[] = [];
  if (notReachedYet > 0) parts.push(`${notReachedYet} not reached yet`);
  if (openAsks > 0) parts.push(openAsks === 1 ? "1 open ask" : `${openAsks} open asks`);
  return parts.join(" · ");
}

/** The weekly reminder bell entries due at `now`. One per staff member whose
 *  schedule covers this campus hour and who has something waiting. */
export function weeklyRemindersDue(
  staff: WeeklyReminderStaff[],
  schedule: ReminderSchedule | null | undefined,
  now: number | Date | string,
): DueWeeklyReminder[] {
  const sched = schedule ?? DEFAULT_REMINDER_SCHEDULE;
  const { weekday, hour } = campusWeekdayHour(now);
  const nowDay = campusDayNumber(typeof now === "number" ? now : new Date(now).getTime());
  const due: DueWeeklyReminder[] = [];
  for (const s of staff) {
    if (!s.uid || s.weeklyRemindersOff) continue;

    const plan =
      s.role === "admin"
        ? sched.fullTimers
        : s.role === "manager" && s.team
          ? sched.teams[s.team]
          : undefined;
    if (!plan || !plan.days.includes(weekday as Weekday) || plan.hour !== hour) continue;

    if (s.lastWeeklyReminderAt) {
      const lastMs = Date.parse(s.lastWeeklyReminderAt);
      if (Number.isFinite(lastMs) && campusDayNumber(lastMs) === nowDay) continue;
    }

    if (s.role === "admin") {
      const count = Math.max(0, Math.floor(s.toWorkThrough ?? 0));
      if (count <= 0) continue;
      due.push({
        uid: s.uid,
        notification: {
          userId: s.uid,
          title: "Around the team",
          message: aroundTeamReminderMessage(count),
          type: "info",
          targetId: "around",
          link: "/around",
        },
      });
    } else {
      const notReachedYet = Math.max(0, Math.floor(s.notReachedYet ?? 0));
      const openAsks = Math.max(0, Math.floor(s.openAsks ?? 0));
      if (notReachedYet + openAsks <= 0) continue;
      due.push({
        uid: s.uid,
        notification: {
          userId: s.uid,
          title: "Your people",
          message: traineeReminderMessage(notReachedYet, openAsks),
          type: "info",
          targetId: "my-day",
          link: "/",
        },
      });
    }
  }
  return due;
}
