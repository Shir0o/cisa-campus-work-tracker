// Mobile v2 — "the trainee app" visual language, ported from the Claude Design
// project's mobile.css (`.m2.deck`, the green room) and mobile-night.css
// (`.m2.night`). See MOBILE-V2.md there for the rationale.
//
// This is DELIBERATELY separate from tokens.ts: v2 does not inherit the Field
// Notes / Material palette, and every other screen in the app still depends on
// that one. Only v2 components read from here.
//
// Hard rules the design carries (do not relax them):
//   • every touch target ≥ 44px
//   • no text ink lighter than cardInk3 (#7d8b7f light / #8e9a92 dark)
//   • the card's foot never scrolls — only its body does
//   • no metrics, no KPI tiles, no recurring gatherings anywhere in v2
import { useMemo } from 'react';
import { useTheme } from './ThemeProvider';
import type { ThemeMode } from './tokens';

export type V2ToneKey = 'follow' | 'ask' | 'due' | 'pray' | 'note';

export interface V2Tone {
  /** Pill background. */
  band: string;
  /** Pill label ink. */
  text: string;
  /** The 8px dot inside the pill. */
  dot: string;
}

export interface V2Palette {
  // The room the card floats in.
  room: string;
  roomInk: string;
  roomInk2: string;
  roomInk3: string;
  /** The floor line under the up-next faces. */
  roomFaint: string;
  /** Tint behind the ☰-style circular chrome buttons. */
  roomChip: string;

  // The card — a white sheet in the light room, a dark sheet at night.
  card: string;
  card2: string;
  cardInk: string;
  cardInk2: string;
  /** The ink floor. Nothing lighter than this is ever used for text. */
  cardInk3: string;
  line: string;
  border: string;

  // Card interior accents.
  ask: string;
  said: string;
  why: string;
  quoteLine: string;
  note: string;
  noteLabel: string;
  noteInk: string;
  /** The reaction chips' resting state. A shade off `card2`: on the white card
   * the notes/about tint would read as a filled button. */
  react: string;

  // Buttons.
  primary: string;
  onPrimary: string;
  warm: string;
  onWarm: string;
  deep: string;
  onDeep: string;
  green: string;
  onGreen: string;
  /** The inverted "black" button — the ＋ fab and the on-tone chips. */
  inverse: string;
  onInverse: string;

  /** The on-campus window strip. */
  window: string;
  onWindow: string;
  onWindowSub: string;
  windowDot: string;

  /** Reaction buttons in their selected state. */
  reactOnBorder: string;
  reactOnBg: string;

  /** The all-clear mark. Sits on the ROOM, so it inverts in light (cream on
   * green) but goes to the primary green at night — it is not `primary`. */
  mark: string;
  onMark: string;

  /** Text fields on a card or sheet. */
  field: string;
  /** The "Dates worth knowing" block, which sits on the room, not on a card. */
  datebox: string;
  dateboxLine: string;

  link: string;

  tones: Record<V2ToneKey, V2Tone>;
}

// ── light: the green room (mobile.css `.m2.deck`) ──────────────────────────
const lightV2: V2Palette = {
  room: '#16332b',
  roomInk: '#eef1e9',
  roomInk2: '#9fbfa8',
  roomInk3: '#7fa189',
  roomFaint: '#8dae97',
  roomChip: 'rgba(238,241,233,0.10)',

  card: '#ffffff',
  card2: '#f4f2ee',
  cardInk: '#16332b',
  cardInk2: '#5f7a68',
  cardInk3: '#7d8b7f',
  line: '#e6e3dc',
  border: '#dcd8d0',

  ask: '#9c4a1c',
  said: '#1e3a30',
  why: '#2c4a3c',
  quoteLine: '#e6e3dc',
  note: '#f4f2ee',
  noteLabel: '#8b7d5c',
  noteInk: '#3b5346',
  react: '#fbfaf8',

  primary: '#16332b',
  onPrimary: '#f4f1e6',
  warm: '#a4562f',
  onWarm: '#f4f1e6',
  deep: '#4a3b63',
  onDeep: '#f4f1e6',
  green: '#2f5c3c',
  onGreen: '#f4f1e6',
  inverse: '#f4f1e6',
  onInverse: '#16332b',

  window: '#c9622f',
  onWindow: '#ffffff',
  onWindowSub: '#ffe3d1',
  windowDot: '#ffd9bf',

  reactOnBorder: '#16332b',
  reactOnBg: '#e3ebe1',

  mark: '#f4f1e6',
  onMark: '#16332b',

  field: '#fbfaf8',
  datebox: 'rgba(244,241,230,0.07)',
  dateboxLine: 'rgba(244,241,230,0.12)',

  link: '#2b4a6e',

  tones: {
    follow: { band: '#fbeee4', text: '#a8501f', dot: '#c9622f' },
    ask: { band: '#e9eef5', text: '#2b4a6e', dot: '#2b4a6e' },
    due: { band: '#faf0da', text: '#8a6410', dot: '#c99a2f' },
    pray: { band: '#efe9f5', text: '#5c4478', dot: '#8d7aa8' },
    note: { band: '#e8efe8', text: '#3c5c40', dot: '#6c8f6f' },
  },
};

// ── dark: the same room at night (mobile-night.css `.m2.night`) ────────────
const darkV2: V2Palette = {
  room: '#0b1611',
  roomInk: '#eaefe9',
  roomInk2: '#ccd6cf',
  roomInk3: '#a3afa7',
  roomFaint: '#8e9a92',
  roomChip: 'rgba(234,239,233,0.08)',

  card: '#1b2a23',
  card2: '#243429',
  cardInk: '#eaefe9',
  cardInk2: '#ccd6cf',
  cardInk3: '#8e9a92',
  line: 'rgba(234,239,233,0.10)',
  border: '#31423a',

  ask: '#e0a07a',
  said: '#ccd6cf',
  why: '#ccd6cf',
  quoteLine: '#31423a',
  note: '#243429',
  noteLabel: '#8e9a92',
  noteInk: '#ccd6cf',
  react: '#243429',

  primary: '#31614e',
  onPrimary: '#eaf3ec',
  warm: '#b3562b',
  onWarm: '#fdf3ee',
  deep: '#5b4780',
  onDeep: '#f2eef8',
  green: '#3c6b4a',
  onGreen: '#eef6ef',
  inverse: '#e9eee9',
  onInverse: '#0f1a15',

  window: '#a94f26',
  onWindow: '#ffffff',
  onWindowSub: '#ffe3d1',
  windowDot: '#ffd9bf',

  reactOnBorder: '#93b8de',
  reactOnBg: '#1c2836',

  mark: '#31614e',
  onMark: '#eaf3ec',

  field: '#243429',
  datebox: '#1b2a23',
  dateboxLine: 'rgba(234,239,233,0.10)',

  link: '#93b8de',

  tones: {
    follow: { band: '#33221a', text: '#e2a87c', dot: '#c9622f' },
    ask: { band: '#1c2836', text: '#9dbde0', dot: '#7ba3d0' },
    due: { band: '#322916', text: '#dfbc70', dot: '#c99a2f' },
    pray: { band: '#29203a', text: '#c2abdd', dot: '#9784b3' },
    note: { band: '#1c2a1f', text: '#a5c5a8', dot: '#75a078' },
  },
};

export const v2Palettes: Record<ThemeMode, V2Palette> = { light: lightV2, dark: darkV2 };

// Manrope 500–800 throughout; Instrument Serif for the one end-of-queue
// headline. Tracking is tight (−.03em) on the display weights.
export const v2Font = {
  medium: 'Manrope_500Medium',
  semi: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extra: 'Manrope_800ExtraBold',
  serif: 'InstrumentSerif_400Regular',
} as const;

export const v2Radius = {
  card: 30,
  hero: 28,
  badge: 18,
  button: 18,
  note: 16,
  tile: 22,
  row: 20,
  chip: 999,
} as const;

// `0 20px 44px -14px rgba(0,0,0,.55)` doesn't map to RN 1:1 — a large blurred
// shadow with a negative spread reads as a soft, tight-ish drop. These are the
// closest RN equivalents (iOS shadow* / Android elevation).
export const v2Shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

export interface V2Theme {
  mode: ThemeMode;
  c: V2Palette;
  font: typeof v2Font;
  radius: typeof v2Radius;
  shadow: typeof v2Shadow;
}

/** One hook for every v2 component. Follows the app's light/dark the same way
 * the rest of the app does — v2 is a second palette, not a second app. */
export function useV2Theme(): V2Theme {
  const { mode } = useTheme();
  return useMemo(
    () => ({ mode, c: v2Palettes[mode], font: v2Font, radius: v2Radius, shadow: v2Shadow }),
    [mode],
  );
}
