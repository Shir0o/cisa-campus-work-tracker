import React, { createContext, useCallback, useContext, useState } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * Navigation shell preference (#664).
 *
 * Three states the user can pick: a labelled rail, a compact icon-only rail,
 * or the legacy top bar. Settings/explicit user action writes one of these
 * values; width rules derive the *effective* shell from the stored value.
 *
 * The provider is the single source of truth for shell resolution. It reads
 * localStorage in the state initialiser so the first paint already shows the
 * right shell — reading in an effect would flash the default on every load.
 *
 * Width rules:
 *   - ≥ 1280px (Tailwind `xl`): stored preference honoured as-is.
 *   - 1024–1279px (lg..xl): a 232px rail is a quarter of the screen, so any
 *     rail preference is forced to `rail-collapsed`. The forced collapse is
 *     component state only — it never writes to storage. `topbar` still fits,
 *     so it's unchanged.
 *   - < 1024px: the provider keeps reporting the desktop shell, but the
 *     consumer branches on `useMediaQuery('(min-width: 1024px)')` and falls
 *     through to the top-bar shell — which carries its own hamburger drawer
 *     below `lg`, and MobileNav's bottom bar below `md`. The preference is
 *     intentionally not consulted at this width.
 *
 * These thresholds were 1180/768 and are now 1280/1024, matching the spec and
 * the canvas. See docs/design/DRIFT.md #5.
 */
export type NavShellPreference = 'rail' | 'rail-collapsed' | 'topbar';

export type NavShell = NavShellPreference;

interface NavShellState {
  /** Stored preference. Persisted to localStorage; the user's choice. */
  preference: NavShellPreference;
  /** The shell to render *now*, after viewport width rules are applied. */
  effective: NavShell;
  /** Persist a new preference. */
  setPreference: (next: NavShellPreference) => void;
}

const DEFAULT_PREFERENCE: NavShellPreference = 'rail';
const RAIL_FITS_MIN_WIDTH = 1280; // Tailwind `xl` — below this, the rail (232px) won't fit
const STORAGE_KEY = 'campus-hub-nav-shell';

const VALID_PREFERENCES: readonly NavShellPreference[] = [
  'rail',
  'rail-collapsed',
  'topbar',
];

function readStoredPreference(): NavShellPreference {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && (VALID_PREFERENCES as readonly string[]).includes(raw)) {
    return raw as NavShellPreference;
  }
  return DEFAULT_PREFERENCE;
}

const NavShellContext = createContext<NavShellState | undefined>(undefined);

export interface NavShellProviderProps {
  children: React.ReactNode;
}

export function NavShellProvider({ children }: NavShellProviderProps) {
  // Read once at construction so the first paint already reflects storage —
  // the same approach the theme provider uses. An effect-based read would
  // flash the default shell on every load (#664, "the correct shell on first
  // paint").
  const [preference, setPreferenceState] = useState<NavShellPreference>(readStoredPreference);

  // Above the breakpoint at which a 232px rail stops being affordable. Below
  // this threshold, width rules force a rail preference into its collapsed
  // form. `topbar` still fits in this band, so it's unchanged.
  const canFitRail = useMediaQuery(`(min-width: ${RAIL_FITS_MIN_WIDTH}px)`);

  // Derived: stored preference, modified only by width rules. The rules never
  // write to storage; the user does, via `setPreference`.
  const effective: NavShell =
    preference === 'topbar'
      ? 'topbar'
      : canFitRail
        ? preference
        : 'rail-collapsed';

  // No side-effects needed — `effective` is computed from `preference` and
  // `canFitRail` on every render. The earlier idea of a `collapsedOverride`
  // was overengineered: the chevron in the rail calls `setPreference` with
  // `rail` or `rail-collapsed` directly, which writes to storage like any
  // other user choice. Resizing never writes.
  const setPreference = useCallback((next: NavShellPreference) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    setPreferenceState(next);
  }, []);

  const value: NavShellState = {
    preference,
    effective,
    setPreference,
  };

  return <NavShellContext.Provider value={value}>{children}</NavShellContext.Provider>;
}

/** Default preference, exported for the Settings page. */
export const NAV_SHELL_DEFAULT_PREFERENCE = DEFAULT_PREFERENCE;

/** Available preference values, exported for the Settings page. */
export const NAV_SHELL_PREFERENCES: readonly NavShellPreference[] = VALID_PREFERENCES;

export function useNavShell(): NavShellState {
  const ctx = useContext(NavShellContext);
  if (!ctx) {
    throw new Error('useNavShell must be used within a NavShellProvider');
  }
  return ctx;
}