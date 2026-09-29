// Pure season calendar — which season a date falls in. No Firestore or React,
// so server-side code (via ./partnersModel) can use it; ./seasons re-exports it.

export type SeasonId = "spring" | "summer" | "fall" | "winter";

export interface SeasonMeta {
  id: SeasonId;
  label: string;
  tone: "sage" | "amber" | "accent" | "teal";
  blurb: string;
}

export const SEASONS: Record<SeasonId, SeasonMeta> = {
  spring: { id: "spring", label: "Spring", tone: "sage", blurb: "A new term, fresh starts." },
  summer: { id: "summer", label: "Summer", tone: "amber", blurb: "A quieter campus, deeper roots." },
  fall: { id: "fall", label: "Fall", tone: "accent", blurb: "The big welcome — new faces everywhere." },
  winter: { id: "winter", label: "Winter", tone: "teal", blurb: "Slowing down before the new year." },
};

// 0-indexed month → season. Jan–Feb winter, Mar–May spring, Jun–Jul summer, Aug–Dec fall.
const SEASON_BY_MONTH: SeasonId[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "fall", "fall", "fall", "fall", "fall",
];

export function seasonForDate(d: Date = new Date()): SeasonId {
  return SEASON_BY_MONTH[d.getMonth()];
}
