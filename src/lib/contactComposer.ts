import { format } from "date-fns";

/** Interaction or Prayer: the story composer writes one or the other (#1292). */
export type ComposerMode = "interaction" | "prayer";

/** The interaction kinds the chip row offers. "interaction" is the Other chip. */
export const INTERACTION_TYPES = ["chat", "call", "meeting", "email", "interaction"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export interface ComposerValue {
  mode: ComposerMode;
  /** What happened, or the prayer burden. */
  text: string;
  /** The optional detail under a prayer. */
  context: string;
  type: InteractionType;
  /** Local wall-clock time, `yyyy-MM-dd'T'HH:mm`, the shape firestore holds. */
  dateTime: string;
  /** A teammate who reached the person, when a Full-timer logs it on their
   *  behalf (#1288). Empty string means "me". */
  reachedById: string;
}

export function formatDateTime(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function emptyComposer(now: Date = new Date()): ComposerValue {
  return {
    mode: "interaction",
    text: "",
    context: "",
    type: "chat",
    dateTime: formatDateTime(now),
    reachedById: "",
  };
}

/** The chip's short reading of the moment being logged. The component turns the
 *  kind into a translated label; keeping the shape here makes it testable. */
export type TimeChip =
  | { kind: "now" }
  | { kind: "today"; time: string }
  | { kind: "yesterday"; time: string }
  | { kind: "older"; date: string; time: string };

function parseLocal(value: string): Date | null {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function timeChipFor(dateTime: string, now: Date = new Date()): TimeChip {
  const d = parseLocal(dateTime);
  if (!d) return { kind: "now" };
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (Math.abs(now.getTime() - d.getTime()) < 2 * 60_000) return { kind: "now" };
  if (sameDay(d, now)) return { kind: "today", time };
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return { kind: "yesterday", time };
  return {
    kind: "older",
    date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    time,
  };
}

export interface TimePreset {
  key: "now" | "m15" | "h1" | "yesterday" | "d2";
  at: string;
}

/** Quick back-dating choices for the time chip. */
export function timePresets(now: Date = new Date()): TimePreset[] {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const twoDays = new Date(now);
  twoDays.setDate(now.getDate() - 2);
  return [
    { key: "now", at: formatDateTime(now) },
    { key: "m15", at: formatDateTime(ago(15)) },
    { key: "h1", at: formatDateTime(ago(60)) },
    { key: "yesterday", at: formatDateTime(yesterday) },
    { key: "d2", at: formatDateTime(twoDays) },
  ];
}
