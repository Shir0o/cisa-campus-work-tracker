// Seasons — the term we're in, auto-derived from today. Drives club-rush intake:
// a new sign-up is stamped with the season so a whole cohort ("everyone we met in
// Fall '26") can be found again later. The active season is auto-picked from the
// date but can be overridden, with a "club rush" flag for the busy welcome weeks.
//
// PURE subset for @cisa/core. The Firestore-backed pieces (subscribeSeasonSettings,
// saveSeasonSettings, useSeason) live in each app's data layer for now and read
// the team-wide `settings/season` doc.

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

export const SEASON_ORDER: SeasonId[] = ["spring", "summer", "fall", "winter"];

// 0-indexed month → season. Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov fall.
const SEASON_BY_MONTH: SeasonId[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "fall", "fall", "fall", "winter",
];

export function seasonForDate(d: Date = new Date()): SeasonId {
  return SEASON_BY_MONTH[d.getMonth()];
}

export function seasonYear(d: Date = new Date()): string {
  return String(d.getFullYear()).slice(2);
}

/** A human cohort label like "Fall '26". */
export function seasonLabel(id: SeasonId, d: Date = new Date()): string {
  return `${SEASONS[id].label} '${seasonYear(d)}`;
}

/** Cohort tags for a new contact — readable, matching the existing tag style. */
export function seasonTags(activeId: SeasonId, clubRush: boolean): string[] {
  const tags = [seasonLabel(activeId)];
  if (clubRush) tags.push("Club Rush");
  return tags;
}
