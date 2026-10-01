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
