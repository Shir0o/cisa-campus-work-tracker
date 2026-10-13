import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, handleFirestoreError, OperationType } from "./firebase";
import {
  SEASONS,
  seasonForDate,
  type SeasonId,
  type SeasonMeta,
  SEASON_ORDER,
  seasonYear,
  seasonLabel,
  seasonTags,
  getAutoSemesterAndSchoolYearTags,
} from "../../packages/core/src/seasons";
import type { SeasonSettings } from "../types";

export {
  SEASONS,
  seasonForDate,
  type SeasonId,
  type SeasonMeta,
  SEASON_ORDER,
  seasonYear,
  seasonLabel,
  seasonTags,
  getAutoSemesterAndSchoolYearTags,
};


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
  /** BFA intake, the parallel of Club Rush (#1045). */
  bfa?: boolean;
  label: string;
  tags: string[];
  setSeason: (id: SeasonId) => void;
  resetSeason: () => void;
  toggleClubRush: () => void;
  toggleBfa?: () => void;
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
  const bfa = !!settings.bfa;

  return {
    autoId,
    activeId,
    active: SEASONS[activeId],
    isAuto: !override,
    clubRush,
    bfa,
    label: seasonLabel(activeId),
    tags: seasonTags(activeId, clubRush, new Date(), bfa),
    setSeason: (id) => void saveSeasonSettings({ override: id === autoId ? null : id }),
    resetSeason: () => void saveSeasonSettings({ override: null }),
    toggleClubRush: () => void saveSeasonSettings({ clubRush: !clubRush }),
    toggleBfa: () => void saveSeasonSettings({ bfa: !bfa }),
  };
}
