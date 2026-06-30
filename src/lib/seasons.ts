import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType } from "./firebase";
import type { SeasonSettings } from "../types";

// Seasons — the term we're in, auto-derived from today. Drives club-rush intake:
// a new sign-up is stamped with the season so a whole cohort ("everyone we met in
// Fall '26") can be found again later. The active season is auto-picked from the
// date but can be overridden, with a "club rush" flag for the busy welcome weeks.
// Both live in a single team-wide doc (settings/season), publicly readable so the
// public sign-up reflects them.

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

const seasonDoc = () => doc(db, "settings", "season");

/** Live subscription to the team-wide season settings. */
export function subscribeSeasonSettings(
  cb: (settings: SeasonSettings) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    seasonDoc(),
    (snap) => {
      const data = typeof snap?.data === "function" ? (snap.data() as SeasonSettings | undefined) : undefined;
      cb(data ?? {});
    },
    (e) => (onError ? onError(e) : console.error("season settings subscription error", e)),
  );
}

/** Merge-write the season settings (create-or-update). */
export async function saveSeasonSettings(patch: Partial<SeasonSettings>): Promise<void> {
  try {
    await setDoc(seasonDoc(), patch, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "settings/season");
  }
}

export interface SeasonView {
  autoId: SeasonId;
  activeId: SeasonId;
  active: SeasonMeta;
  isAuto: boolean;
  clubRush: boolean;
  label: string;
  tags: string[];
  setSeason: (id: SeasonId) => void;
  resetSeason: () => void;
  toggleClubRush: () => void;
}

/**
 * Combine the date-derived auto season with the live override/club-rush doc into
 * one convenient view. Re-renders on any settings change. Setters write through
 * to Firestore (no-op for readers without write permission — rules gate it).
 */
export function useSeason(): SeasonView {
  const [settings, setSettings] = useState<SeasonSettings>({});
  useEffect(() => subscribeSeasonSettings(setSettings), []);

  const autoId = seasonForDate();
  const override =
    settings.override && SEASON_ORDER.includes(settings.override as SeasonId)
      ? (settings.override as SeasonId)
      : null;
  const activeId = override ?? autoId;
  const clubRush = !!settings.clubRush;

  return {
    autoId,
    activeId,
    active: SEASONS[activeId],
    isAuto: !override,
    clubRush,
    label: seasonLabel(activeId),
    tags: seasonTags(activeId, clubRush),
    setSeason: (id) => void saveSeasonSettings({ override: id === autoId ? null : id }),
    resetSeason: () => void saveSeasonSettings({ override: null }),
    toggleClubRush: () => void saveSeasonSettings({ clubRush: !clubRush }),
  };
}
