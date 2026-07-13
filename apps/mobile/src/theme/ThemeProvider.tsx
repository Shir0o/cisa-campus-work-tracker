import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
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

type SchemePref = 'light' | 'dark' | 'system';

interface ThemeContextValue extends Theme {
  scheme: SchemePref;
  setScheme: (s: SchemePref) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Replaces the web ThemeProvider's `.dark` class toggle with a context that
 * feeds a JS theme object. Defaults to following the OS color scheme; a manual
 * override is supported (persist it to AsyncStorage in a later pass).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = (useColorScheme() ?? 'light') as ThemeMode;
  const [scheme, setScheme] = useState<SchemePref>('system');
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
    [mode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
