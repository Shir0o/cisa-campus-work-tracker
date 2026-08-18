// Shared date-bucket vocabulary for scannable lists — one set of cut-offs for
// "Today / Yesterday / This week / …" everywhere the app groups by time, so the
// merged attention feed, History, and any future surface all agree. Built on the
// parsing/day primitives in ./helpers rather than re-deriving them.
import { DAY_MS, parseMs } from "./helpers";

export type DateBucket =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "older";

const BUCKET_ORDER: Record<DateBucket, number> = {
  today: 0,
  yesterday: 1,
  thisWeek: 2,
  lastWeek: 3,
  thisMonth: 4,
  lastMonth: 5,
  older: 6,
};

const BUCKET_LABEL: Record<DateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "Earlier this month",
  lastMonth: "Last month",
  older: "Longer ago",
};

// Calendar days between a timestamp and today, measured start-of-day to
// start-of-day, so an item from 23:59 yesterday is "Yesterday", not "Today"
// (a rolling 24-hour window would mislabel it).
const calendarDaysSince = (ms: number): number => {
  const startOf = (x: number) => {
    const d = new Date(x);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  return Math.max(0, Math.round((startOf(Date.now()) - startOf(ms)) / DAY_MS));
};

const toMs = (date: string | number | Date | null | undefined): number | null => {
  if (date == null) return null;
  if (typeof date === "number") return Number.isNaN(date) ? null : date;
  if (date instanceof Date) return Number.isNaN(date.getTime()) ? null : date.getTime();
  return parseMs(date);
};

export const bucketFor = (date: string | number | Date | null | undefined): DateBucket | null => {
  const ms = toMs(date);
  if (ms == null) return null;
  const d = calendarDaysSince(ms);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d <= 6) return "thisWeek";
  if (d <= 13) return "lastWeek";
  if (d <= 30) return "thisMonth";
  if (d <= 60) return "lastMonth";
  return "older";
};

export const bucketLabel = (key: DateBucket): string => BUCKET_LABEL[key];

export const bucketOrder = (key: DateBucket): number => BUCKET_ORDER[key];