// Pure "Answered" logic — filtering/grouping prayers marked answered into a
// wall of testimonies. Shared by web (src/views/AnsweredList.tsx) and mobile
// (the Answered screen). Ported from AnsweredList.tsx's inline useMemo; tone
// selection stays here (a plain 4-way hash, no platform colors) since each
// platform maps it to its own color tokens (mirrors history.ts's `bucket`).
import type { PrayerRecord } from "./types";

export type AnsweredTone = "accent" | "violet" | "amber" | "sage";

const TONES: AnsweredTone[] = ["accent", "violet", "amber", "sage"];

/** Deterministic tone for a prayer id, so the same prayer always reads the same color. */
export function toneForAnsweredId(id: string): AnsweredTone {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return TONES[sum % TONES.length];
}

export interface AnsweredGroups {
  recent: PrayerRecord[];
  earlier: PrayerRecord[];
  totalThisYear: number;
}

const DAY_MS = 86_400_000;

/**
 * Filters prayers to those marked answered, then splits them into "recent"
 * (answered within the last 90 days) and "earlier", both sorted newest-first
 * by answered date. Also counts how many were answered in the current
 * calendar year (for the header stat).
 */
export function groupAnsweredPrayers(prayers: PrayerRecord[], now: number = Date.now()): AnsweredGroups {
  const year = new Date(now).getFullYear();
  const ninetyDaysAgo = now - 90 * DAY_MS;

  const answered = prayers.filter((p) => p.status === "answered");

  let totalThisYear = 0;
  const recent: PrayerRecord[] = [];
  const earlier: PrayerRecord[] = [];

  for (const p of answered) {
    const at = p.answeredAt || p.updatedAt || p.date;
    const dateMs = new Date(at).getTime();
    if (new Date(at).getFullYear() === year) totalThisYear++;
    if (dateMs >= ninetyDaysAgo) recent.push(p);
    else earlier.push(p);
  }

  const sortByDate = (a: PrayerRecord, b: PrayerRecord) => {
    const tA = new Date(a.answeredAt || a.updatedAt || a.date).getTime();
    const tB = new Date(b.answeredAt || b.updatedAt || b.date).getTime();
    return tB - tA;
  };

  return {
    recent: recent.sort(sortByDate),
    earlier: earlier.sort(sortByDate),
    totalThisYear,
  };
}
