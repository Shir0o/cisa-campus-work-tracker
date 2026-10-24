/**
 * Looking back reads one date, three ways — the day marker, the clock and the
 * day grouping — from a value that may be an ISO string (written by
 * `logActivity`) or a Firestore `Timestamp` (written by the webhook, the batch
 * ingest and the tag engine). `new Date(timestamp)` is Invalid Date, which used
 * to take the whole phone screen down with "Invalid time value" (#1768).
 *
 * The marker keeps the date in the label column and the weekday beside it, so a
 * record that runs for years scans down one column instead of flipping at the
 * 7-day boundary — and carries the year when it is not this year, so two
 * Septembers are not the same marker.
 */
import { parseMs } from "../components/landing/helpers";
import { bucketFor } from "../components/landing/dateBuckets";

export const historyMs = (createdAt: unknown): number | null => parseMs(createdAt);

type Translate = (key: string, fallback?: string) => string;

const DAY_WORDS: Record<string, { today: string; yesterday: string }> = {
  en: { today: "Today", yesterday: "Yesterday" },
  es: { today: "Hoy", yesterday: "Ayer" },
};

const languageOf = (locale: string) => (locale.startsWith("es") ? "es" : "en");

export interface DayMark {
  label: string;
  sub: string;
}

export function dayMark(createdAt: unknown, locale: string, t: Translate): DayMark {
  const ms = historyMs(createdAt);
  if (ms == null) return { label: "", sub: "" };
  const at = new Date(ms);
  const language = languageOf(locale);
  const sameYear = at.getFullYear() === new Date().getFullYear();

  const date = at.toLocaleDateString(language, {
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const weekday = at.toLocaleDateString(language, { weekday: "long" });

  const bucket = bucketFor(ms);
  if (bucket === "today") return { label: t("history.today", DAY_WORDS[language].today), sub: date };
  if (bucket === "yesterday") {
    return { label: t("history.yesterday", DAY_WORDS[language].yesterday), sub: date };
  }
  return { label: date, sub: weekday };
}

export function clockLabel(createdAt: unknown, locale: string): string {
  const ms = historyMs(createdAt);
  if (ms == null) return "";
  return new Date(ms).toLocaleTimeString(languageOf(locale), {
    hour: "numeric",
    minute: "2-digit",
  });
}

export type HistoryRow<A extends { id: string; createdAt: unknown }> =
  | { type: "date"; at: A["createdAt"]; key: string }
  | { type: "item"; a: A; key: string };

/**
 * One continuous stream with a marker wherever the day changes.
 *
 * The client orders by `createdAt`, and Firestore sorts by *type* before value:
 * a collection holding both ISO strings (`logActivity`) and Timestamps (the
 * webhook, the batch ingest, the tag engine) comes back in two blocks, so the
 * same day can appear twice and the stream can run backwards within itself.
 * Ordering here by the parsed instant fixes the sequence and the markers with
 * it. A row the app cannot date still appears — it just carries no marker.
 */
export function historyRows<A extends { id: string; createdAt: unknown }>(items: A[]): HistoryRow<A>[] {
  const ordered = [...items].sort((a, b) => {
    const am = historyMs(a.createdAt);
    const bm = historyMs(b.createdAt);
    if (am == null && bm == null) return 0;
    if (am == null) return 1;
    if (bm == null) return -1;
    return bm - am;
  });

  const out: HistoryRow<A>[] = [];
  let lastDay: string | null = null;
  for (const a of ordered) {
    const ms = historyMs(a.createdAt);
    const k = ms == null ? null : new Date(ms).toDateString();
    if (k !== null && k !== lastDay) {
      out.push({ type: "date", at: a.createdAt, key: "d:" + k });
      lastDay = k;
    }
    out.push({ type: "item", a, key: a.id });
  }
  return out;
}
