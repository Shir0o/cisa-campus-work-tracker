// RN theme tokens — the authoritative palette for the non-v2 screens (login,
// signup, attendance, coordination, settings, …). Ported from the web app's
// Bento token set (`src/index.css`), itself the design's Bento design system:
// violet #5C17E5 on cool blue-leaning neutrals, Lexend only (400/500/600).

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

  // Stage tones (accent = slate/blue, amber = clay/orange, teal = sage/green,
  // violet = plum). Concrete hex approximations of Bento's oklch data-viz hues.
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
  primary: '#5C17E5',
  onPrimary: '#FFFFFF',
  primaryContainer: 'rgba(92, 23, 229, 0.08)',
  onPrimaryContainer: '#5C17E5',

  secondary: '#525E6F',
  onSecondary: '#FFFFFF',
  secondaryContainer: 'rgba(92, 23, 229, 0.08)',
  onSecondaryContainer: '#5C17E5',

  tertiary: '#2F7A8A',
  onTertiary: '#FFFFFF',
  tertiaryContainer: 'rgba(47, 122, 138, 0.14)',
  onTertiaryContainer: '#1A212B',

  error: '#B1000F',
  onError: '#FFFFFF',
  errorContainer: '#FFD4D8',
  onErrorContainer: '#B1000F',

  background: '#F6F8FB',
  onBackground: '#1A212B',

  surface: '#FFFFFF',
  onSurface: '#1A212B',
  surfaceVariant: '#F6F8FB',
  onSurfaceVariant: '#525E6F',

  outline: '#DEE4ED',
  outlineVariant: '#ECEFF4',

  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#FFFFFF',
  surfaceContainer: '#F6F8FB',
  surfaceContainerHigh: '#F6F8FB',
  surfaceContainerHighest: '#F6F8FB',

  success: '#016A1C',
  successContainer: '#E1FCDE',
  warning: '#BA5900',
  warningContainer: '#FFF2D2',

  stageAccent: '#4A5A8C',
  stageAccentSoft: 'rgba(74, 90, 140, 0.12)',
  stageAmber: '#B25A22',
  stageAmberSoft: 'rgba(178, 90, 34, 0.12)',
  stageTeal: '#3F7A5C',
  stageTealSoft: 'rgba(63, 122, 92, 0.12)',
  stageViolet: '#8A4F8C',
  stageVioletSoft: 'rgba(138, 79, 140, 0.12)',
};

export const darkColors: ThemeColors = {
  primary: '#5C17E5',
  onPrimary: '#FFFFFF',
  primaryContainer: 'rgba(154, 143, 255, 0.18)',
  onPrimaryContainer: '#9A8FFF',

  secondary: '#B6C2D3',
  onSecondary: '#FFFFFF',
  secondaryContainer: 'rgba(154, 143, 255, 0.18)',
  onSecondaryContainer: '#9A8FFF',

  tertiary: '#7FC6D4',
  onTertiary: '#1A212B',
  tertiaryContainer: 'rgba(127, 198, 212, 0.18)',
  onTertiaryContainer: '#1A212B',

  error: '#F14A58',
  onError: '#1A212B',
  errorContainer: 'rgba(241, 74, 88, 0.16)',
  onErrorContainer: '#FFD4D8',

  background: '#1A212B',
  onBackground: '#F6F8FB',

  surface: '#27313F',
  onSurface: '#F6F8FB',
  surfaceVariant: '#202936',
  onSurfaceVariant: '#B6C2D3',

  outline: '#3C4959',
  outlineVariant: '#333E4C',

  surfaceContainerLowest: '#27313F',
  surfaceContainerLow: '#202936',
  surfaceContainer: '#202936',
  surfaceContainerHigh: '#27313F',
  surfaceContainerHighest: '#27313F',

  success: '#51E098',
  successContainer: 'rgba(81, 224, 152, 0.16)',
  warning: '#F2930D',
  warningContainer: 'rgba(242, 147, 13, 0.16)',

  stageAccent: '#9AB0E0',
  stageAccentSoft: 'rgba(154, 176, 224, 0.18)',
  stageAmber: '#E2A87C',
  stageAmberSoft: 'rgba(226, 168, 124, 0.18)',
  stageTeal: '#A5C5A8',
  stageTealSoft: 'rgba(165, 197, 168, 0.18)',
  stageViolet: '#C2ABDD',
  stageVioletSoft: 'rgba(194, 171, 221, 0.18)',
};

// Lexend only — 400 body / 500 label / 600 structural. No serif.
export const typography = {
  fontSerif: 'Lexend_600SemiBold', // structural headings (no serif under Bento)
  fontSans: 'Lexend_400Regular', // body
  fontSansSemiBold: 'Lexend_600SemiBold', // AppText's "label" / emphasis variant
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
