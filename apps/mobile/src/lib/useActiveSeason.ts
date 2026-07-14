// Active season cohort — read-only mirror of the web app's useSeason() (no
// override/club-rush setters; mobile isn't getting season-management UI yet).
// Used to stamp new contacts with the current cohort tag, e.g. "Fall '26".
import { useEffect, useState } from 'react';
import {
  SEASON_ORDER,
  seasonForDate,
  seasonLabel,
  seasonTags,
  type SeasonId,
  type SeasonSettings,
} from '@cisa/core';
import { subscribeSeasonSettings } from './data/seasons';

export interface ActiveSeason {
  activeId: SeasonId;
  label: string;
  clubRush: boolean;
  tags: string[];
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

  return {
    activeId,
    label: seasonLabel(activeId),
    clubRush,
    tags: seasonTags(activeId, clubRush),
  };
}
