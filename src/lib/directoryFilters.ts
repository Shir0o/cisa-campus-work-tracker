// Per-user retention of the People directory's filter state (#1067).
//
// Opening a contact renders the full-page detail in place of the directory, so
// the directory component unmounts and its local `useState` filters are lost on
// back. Scroll survives that swap via `usePreserveScroll` (state held on the
// shell), and this store does the same for filters: an in-memory map keyed by
// the effective user, so state survives the directory's unmount/remount across
// contact-detail navigation without persisting past a full page reload or
// leaking across accounts/roles.

import type { ContactKind } from './contactKind';

/** The kind segment the Directory opens on, or `all` for no kind narrowing. */
export type KindSegment = 'all' | ContactKind;

/** How the People list is ordered (#1783): the four stated orders in the
 *  control, in the order the control lists them. */
export type DirectorySort = 'recent' | 'longest' | 'added' | 'name';

/** The orders, for rendering the control. */
export const DIRECTORY_SORTS: readonly DirectorySort[] = ['recent', 'longest', 'added', 'name'];

export interface DirectoryFilterState {
  searchQuery: string;
  filterStage: string;
  kindSegment: KindSegment;
  filterUnsorted: boolean;
  filterNotReached: boolean;
  selectedTags: string[];
  sort: DirectorySort;
}

export const DEFAULT_DIRECTORY_FILTERS: DirectoryFilterState = {
  searchQuery: '',
  filterStage: 'All',
  kindSegment: 'contact',
  filterUnsorted: false,
  filterNotReached: false,
  selectedTags: [],
  // The list's existing order, so adding the control changes nothing until
  // someone asks for a different one.
  sort: 'name',
};

/**
 * Fields a memory may still carry from filters that were cut (§23): the
 * background, interest, has-phone and added-when narrowings, and the Group
 * filter retired before them (#1345). A remounted directory drops them rather
 * than restoring a filter whose control no longer exists.
 */
const RETIRED_FILTER_KEYS = [
  'filterRole',
  'filterSpiritualBackground',
  'filterInterest',
  'filterHasPhone',
  'filterAddedWhen',
  'customRange',
] as const;

const store = new Map<string, DirectoryFilterState>();

/** The last-known filter state for a user, or the defaults if never set. */
export function readDirectoryFilters(userKey: string): DirectoryFilterState {
  const saved = { ...(store.get(userKey) ?? DEFAULT_DIRECTORY_FILTERS) } as DirectoryFilterState &
    Record<string, unknown>;
  for (const key of RETIRED_FILTER_KEYS) delete saved[key];
  return {
    ...saved,
    // Likewise the order (#1783): a memory from before the sort control opens
    // on the list's existing order rather than on no option at all.
    sort: DIRECTORY_SORTS.includes(saved.sort) ? saved.sort : 'name',
    selectedTags: [...saved.selectedTags],
  };
}

/** Remember a user's filter state so a remounted directory can restore it. */
export function writeDirectoryFilters(userKey: string, state: DirectoryFilterState): void {
  store.set(userKey, {
    ...state,
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

// ── The Step filter (§22) ───────────────────────────────────────────────────

/**
 * The Step filter's value for people who are on no step at all. It is a
 * separate value rather than a label, so a step someone happens to name "Not
 * yet placed" cannot be mistaken for it.
 */
export const NOT_YET_PLACED = '__not-yet-placed';

/** One person has no step that exists: missing, blank, or an id whose step has
 *  since been removed. Those people are still findable rather than lost. */
export function isNotYetPlaced(
  contact: { stage?: string | null },
  knownStageLabels: readonly string[],
): boolean {
  const stage = (contact.stage ?? '').trim();
  return stage === '' || !knownStageLabels.includes(stage);
}

/**
 * Narrow a list by the Step filter. `All` changes nothing; a step's label keeps
 * the people on it; `NOT_YET_PLACED` keeps everyone with no step that exists.
 * Returns a new array and leaves the caller's list untouched.
 */
export function filterByStage<T extends { stage?: string | null }>(
  contacts: readonly T[],
  filterStage: string,
  knownStageLabels: readonly string[],
): T[] {
  if (filterStage === 'All') return contacts.slice();
  if (filterStage === NOT_YET_PLACED) {
    return contacts.filter((c) => isNotYetPlaced(c, knownStageLabels));
  }
  return contacts.filter((c) => (c.stage ?? '') === filterStage);
}

// ── The order of the list (#1783) ──────────────────────────────────────────

/** The one field the orders read from a person. `createdAt` is either the ISO
 *  string new documents carry or a legacy Firestore Timestamp, exactly as the
 *  list's own date reading accepts both (#730, legacy-shape fixtures). */
export interface DirectorySortable {
  id: string;
  name?: string;
  createdAt?: unknown;
}

const createdAtMs = (c: DirectorySortable): number | null => {
  const value = c.createdAt as any;
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** Ties always fall back to the name, so the same list comes back in the same
 *  order twice — a sort that reshuffles equal people reads as a bug. */
const byName = (a: DirectorySortable, b: DirectorySortable): number =>
  (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id);

/**
 * Order the People list by one of the four stated orders (#1783):
 *
 * - `recent` — connected with most recently first; anyone never connected
 *   with last.
 * - `longest` — longest since we connected first, so a person nobody has ever
 *   reached leads the list rather than trailing it.
 * - `added` — newest person first.
 * - `name` — alphabetical, the list's default.
 *
 * `lastConnectedMs` reports when someone was last connected with, or `null`
 * for anyone never reached. It is a function rather than a map so the caller
 * keeps owning how "last connected" is derived (interactions, threads,
 * attendance, and the contact's own stamps).
 */
export function sortDirectoryContacts<T extends DirectorySortable>(
  contacts: readonly T[],
  sort: DirectorySort,
  lastConnectedMs: (contactId: string) => number | null,
): T[] {
  const lastConnected = new Map(contacts.map((c) => [c.id, lastConnectedMs(c.id)] as const));
  const compare = (a: T, b: T): number => {
    if (sort === 'name') return byName(a, b);
    const aMs = sort === 'added' ? createdAtMs(a) : lastConnected.get(a.id) ?? null;
    const bMs = sort === 'added' ? createdAtMs(b) : lastConnected.get(b.id) ?? null;
    if (aMs == null || bMs == null) {
      if (aMs == null && bMs == null) return byName(a, b);
      // A person with no date at all sits last when the newest leads, and
      // first when the longest wait leads (never reached is the longest wait).
      return aMs == null ? (sort === 'longest' ? -1 : 1) : sort === 'longest' ? 1 : -1;
    }
    return (sort === 'longest' ? aMs - bMs : bMs - aMs) || byName(a, b);
  };
  return contacts.slice().sort(compare);
}
