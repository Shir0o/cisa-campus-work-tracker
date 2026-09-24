// Per-user retention of the People directory's filter state (#1067).
//
// Opening a contact renders the full-page detail in place of the directory, so
// the directory component unmounts and its local `useState` filters are lost on
// back. Scroll survives that swap via `usePreserveScroll` (state held on the
// shell), and this store does the same for filters: an in-memory map keyed by
// the effective user, so state survives the directory's unmount/remount across
// contact-detail navigation without persisting past a full page reload or
// leaking across accounts/roles.

import type { KindFilter } from './contactKind';

export interface DirectoryFilterState {
  searchQuery: string;
  filterStage: string;
  filterRole: string;
  filterSpiritualBackground: string;
  filterKind: KindFilter;
  filterAddedWhen: 'all' | 'today' | 'week' | 'month';
  customRange: { from: string; to: string };
  selectedTags: string[];
}

export const DEFAULT_DIRECTORY_FILTERS: DirectoryFilterState = {
  searchQuery: '',
  filterStage: 'All',
  filterRole: 'All',
  filterSpiritualBackground: 'All',
  filterKind: 'all',
  filterAddedWhen: 'all',
  customRange: { from: '', to: '' },
  selectedTags: [],
};

const store = new Map<string, DirectoryFilterState>();

/** The last-known filter state for a user, or the defaults if never set. */
export function readDirectoryFilters(userKey: string): DirectoryFilterState {
  const saved = store.get(userKey) ?? DEFAULT_DIRECTORY_FILTERS;
  return {
    ...saved,
    customRange: { ...saved.customRange },
    selectedTags: [...saved.selectedTags],
  };
}

/** Remember a user's filter state so a remounted directory can restore it. */
export function writeDirectoryFilters(userKey: string, state: DirectoryFilterState): void {
  store.set(userKey, {
    ...state,
    customRange: { ...state.customRange },
    selectedTags: [...state.selectedTags],
  });
}

/** Forget a user's retained filters (e.g. a fresh, unfiltered visit). */
export function clearDirectoryFilters(userKey: string): void {
  store.delete(userKey);
}

/** Test-only reset of the module-level store. */
export function __resetDirectoryFilters(): void {
  store.clear();
}