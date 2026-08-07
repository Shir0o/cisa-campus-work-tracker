import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { SchemePref } from '@cisa/core';
import { useAuth } from '../lib/AuthProvider';
import { useAppearance } from '../lib/appearance';
import {
  themes,
  typography,
  radius,
  spacing,
  type ThemeColors,
  type ThemeMode,
} from './tokens';

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  typography: typeof typography;
  radius: typeof radius;
  spacing: typeof spacing;
}

interface ThemeContextValue extends Theme {
  scheme: SchemePref;
  setScheme: (s: SchemePref) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Replaces the web ThemeProvider's `.dark` class toggle with a context that
 * feeds a JS theme object. Defaults to following the OS color scheme; the
 * manual override (Settings → "How it looks") is saved per person, so it
 * survives a restart the way the design's `M2Prefs.appearance` does.
 *
 * Must be mounted INSIDE AuthProvider — the preference is keyed by uid. Signed
 * out, there's nobody to have a preference, so everyone follows the phone.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = (useColorScheme() ?? 'light') as ThemeMode;
  const { uid } = useAuth();
  const [scheme, setScheme] = useAppearance(uid);
  const mode: ThemeMode = scheme === 'system' ? system : scheme;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: themes[mode],
      typography,
      radius,
      spacing,
      scheme,
      setScheme,
      toggle: () => setScheme(mode === 'dark' ? 'light' : 'dark'),
    }),
    [mode, scheme, setScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
