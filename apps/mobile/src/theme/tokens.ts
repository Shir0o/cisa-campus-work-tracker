// RN theme tokens — ported verbatim from the web app's Material token set in
// src/index.css (:root = light, .dark = dark). This is the authoritative palette
// (NOT the orphaned "Field Notes" --panel/--text alias set, which is undefined in
// tracked source; those aliases resolve to the Material tokens below).
//
// "Field notes" visual language: Newsreader serif for headings, Hanken Grotesk
// for body, warm paper (light) / warm slate (dark).

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  background: string;
  onBackground: string;

  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;

  outline: string;
  outlineVariant: string;

  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  success: string;
  successContainer: string;
  warning: string;
  warningContainer: string;

  // Stage tones (accent = slate-blue, amber = terracotta, teal = sage, violet = plum)
  stageAccent: string;
  stageAccentSoft: string;
  stageAmber: string;
  stageAmberSoft: string;
  stageTeal: string;
  stageTealSoft: string;
  stageViolet: string;
  stageVioletSoft: string;
}

export const lightColors: ThemeColors = {
  primary: '#3a5a82',
  onPrimary: '#ffffff',
  primaryContainer: '#dbe3ee',
  onPrimaryContainer: '#233a55',

  secondary: '#5c6675',
  onSecondary: '#ffffff',
  secondaryContainer: '#e1e7f0',
  onSecondaryContainer: '#3b424d',

  tertiary: '#5d8071',
  onTertiary: '#ffffff',
  tertiaryContainer: '#dde7e1',
  onTertiaryContainer: '#36473f',

  error: '#b5503f',
  onError: '#ffffff',
  errorContainer: '#f4ddd8',
  onErrorContainer: '#6e2c20',

  background: '#eaeef4',
  onBackground: '#232b38',

  surface: '#ffffff',
  onSurface: '#232b38',
  surfaceVariant: '#e7ebf3',
  onSurfaceVariant: '#5c6675',

  outline: '#8f98a8',
  outlineVariant: '#d6dde9',

  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f4f6fb',
  surfaceContainer: '#f4f6fb',
  surfaceContainerHigh: '#e1e7f0',
  surfaceContainerHighest: '#e1e7f0',

  success: '#5d8071',
  successContainer: '#dde7e1',
  warning: '#b0833a',
  warningContainer: '#f0e3cd',

  stageAccent: '#3a5a82',
  stageAccentSoft: 'rgba(58, 90, 130, 0.09)',
  stageAmber: '#c0823f',
  stageAmberSoft: 'rgba(192, 130, 63, 0.11)',
  stageTeal: '#5d8071',
  stageTealSoft: 'rgba(93, 128, 113, 0.11)',
  stageViolet: '#7d5a86',
  stageVioletSoft: 'rgba(125, 90, 134, 0.10)',
};

export const darkColors: ThemeColors = {
  primary: '#7aa0cc',
  onPrimary: '#15191f',
  primaryContainer: '#2b3a4d',
  onPrimaryContainer: '#cdddef',

  secondary: '#a6afbe',
  onSecondary: '#15191f',
  secondaryContainer: '#2b333f',
  onSecondaryContainer: '#d7dde6',

  tertiary: '#8bae9d',
  onTertiary: '#15191f',
  tertiaryContainer: '#2f3d37',
  onTertiaryContainer: '#d2e0d8',

  error: '#d77c64',
  onError: '#15191f',
  errorContainer: '#46261f',
  onErrorContainer: '#f2ccc1',

  background: '#15191f',
  onBackground: '#e7ebf2',

  surface: '#1f252e',
  onSurface: '#e7ebf2',
  surfaceVariant: '#262d37',
  onSurfaceVariant: '#a6afbe',

  outline: '#717c8d',
  outlineVariant: '#364150',

  surfaceContainerLowest: '#1f252e',
  surfaceContainerLow: '#1b2027',
  surfaceContainer: '#1b2027',
  surfaceContainerHigh: '#2b333f',
  surfaceContainerHighest: '#2b333f',

  success: '#8fae9d',
  successContainer: '#2f3d37',
  warning: '#d6ac63',
  warningContainer: '#443615',

  stageAccent: '#7aa0cc',
  stageAccentSoft: 'rgba(122, 160, 204, 0.16)',
  stageAmber: '#d39e68',
  stageAmberSoft: 'rgba(211, 158, 104, 0.16)',
  stageTeal: '#8bae9d',
  stageTealSoft: 'rgba(139, 174, 157, 0.16)',
  stageViolet: '#b58cc4',
  stageVioletSoft: 'rgba(181, 140, 196, 0.16)',
};

// Body 15px / 1.6 line-height in the web app; headings use the serif at weight
// 500. Formalized here into a small scale for RN.
export const typography = {
  fontSerif: 'Newsreader_500Medium', // headings
  fontSans: 'HankenGrotesk_400Regular', // body
  fontSansSemiBold: 'HankenGrotesk_600SemiBold', // AppText's "label" variant
  size: { xs: 11, sm: 13, base: 15, md: 17, lg: 21, xl: 27, xxl: 32 },
  lineHeight: 1.6,
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Map the shared board/thread `Tone` union → concrete theme colors (this replaces
// the web-only CHIP_TONE Tailwind-class map dropped from @cisa/core).
export type ToneKey = 'accent' | 'amber' | 'teal' | 'violet' | 'neutral';
export function toneColors(c: ThemeColors, tone: ToneKey): { fg: string; soft: string } {
  switch (tone) {
    case 'accent':
      return { fg: c.stageAccent, soft: c.stageAccentSoft };
    case 'amber':
      return { fg: c.stageAmber, soft: c.stageAmberSoft };
    case 'teal':
      return { fg: c.stageTeal, soft: c.stageTealSoft };
    case 'violet':
      return { fg: c.stageViolet, soft: c.stageVioletSoft };
    default:
      return { fg: c.onSurfaceVariant, soft: c.surfaceVariant };
  }
}

export const themes: Record<ThemeMode, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

// Stages don't carry a fixed RN color (the web app stores an arbitrary
// Tailwind class per stage); deterministically map a stage to one of the 4
// tones by its position in the team's stage list, so the same stage always
// reads the same color.
const STAGE_TONES: ToneKey[] = ['accent', 'amber', 'teal', 'violet'];
export function toneForStage(stages: { label: string }[], label?: string): ToneKey {
  if (!label) return 'neutral';
  const i = stages.findIndex((s) => s.label === label);
  return i < 0 ? 'neutral' : STAGE_TONES[i % STAGE_TONES.length];
}
