// Active season cohort — mirror of the web app's useSeason(), with
// override/club-rush setters now available to mobile managers too.
// Used to stamp new contacts with the current cohort tag, e.g. "Fall 2026".
import { useEffect, useState } from 'react';
import {
  SEASON_ORDER,
  seasonForDate,
  seasonLabel,
  seasonTags,
  type SeasonId,
  type SeasonSettings,
} from '@cisa/core';
import { saveSeasonSettings, subscribeSeasonSettings } from './data/seasons';

export interface ActiveSeason {
  autoId: SeasonId;
  activeId: SeasonId;
  label: string;
  clubRush: boolean;
  tags: string[];
  isAuto: boolean;
  setSeason: (id: SeasonId) => Promise<void>;
  resetSeason: () => Promise<void>;
  toggleClubRush: () => Promise<void>;
}

export function useActiveSeason(): ActiveSeason {
  const [settings, setSettings] = useState<SeasonSettings>({});
  useEffect(() => subscribeSeasonSettings(setSettings), []);

  const autoId = seasonForDate();
  const override =
    settings.override && SEASON_ORDER.includes(settings.override as SeasonId)
      ? (settings.override as SeasonId)
      : null;
  const activeId = override ?? autoId;
  const clubRush = !!settings.clubRush;

  const setSeason = (id: SeasonId) =>
    saveSeasonSettings({ override: id === autoId ? null : id }).catch((e) =>
      console.warn('Failed to update season settings', e),
    );
  const resetSeason = () =>
    saveSeasonSettings({ override: null }).catch((e) =>
      console.warn('Failed to update season settings', e),
    );
  const toggleClubRush = () =>
    saveSeasonSettings({ clubRush: !clubRush }).catch((e) =>
      console.warn('Failed to update season settings', e),
    );

  return {
    autoId,
    activeId,
    label: seasonLabel(activeId),
    clubRush,
    tags: seasonTags(activeId, clubRush),
    isAuto: !override,
    setSeason,
    resetSeason,
    toggleClubRush,
  };
}
