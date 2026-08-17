// Mobile v2 — the phone app's visual language, now running on the SAME Bento
// design system as the web app (the design project's `mobile-bento.css`):
// Lexend only (400/500/600), one cool blue-leaning neutral ramp, violet
// #5C17E5 as the single brand fill, flat hairline cards (16px interactive /
// 24px containers). Every role — the trainee queue, the member app, and the
// full-timer's widgets home — stands in the SAME room; light and dark read the
// same values as the web `src/index.css`.
//
// Kept for API stability: the three-layer structure (room / card / widget) and
// the room/tint contexts survive from the earlier "Field notes" v2 pass, but the
// palette no longer varies by room or tint — only by light/dark. Components read
// the layer they ARE (`c.room` / `c.card` / `c.widget`) exactly as before.
//
// Hard rules that still hold, everywhere:
//   • every touch target ≥ 44px
//   • no text ink lighter than its own layer's `ink3`
//   • a card's foot never scrolls — only its body does
import { createContext, useContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { shellForRole, v2FontScale, type AppRole } from '@cisa/core';
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

/** An RN drop shadow — `shadowColor`/`shadowOffset`/… on iOS, `elevation` on
 *  Android. Bento cards are FLAT, so these are all zeroed out except the FAB. */
export interface V2ShadowStyle {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

/** The ROOM a v2 screen stands in — its ground and the ink that reads on it. */
export interface V2RoomLayer {
  bg: string;
  /** Headings on the room. */
  ink: string;
  /** The quiet line under them. */
  ink2: string;
  /** The room's ink floor. Nothing lighter is used for text. */
  ink3: string;
  /** The floor line under the up-next faces. */
  faint: string;
  /** Tint behind the circular chrome buttons. */
  chip: string;
  /** The "Dates worth knowing" block, which sits on the room, not on a card. */
  datebox: string;
  dateboxLine: string;
  /** The all-clear mark. Sits on the ROOM. */
  mark: string;
  onMark: string;
}

/** The focus card, the bottom sheets, and every pushed person screen. Shared by
 *  all three shells. */
export interface V2CardLayer {
  bg: string;
  bg2: string;
  ink: string;
  ink2: string;
  /** The ink floor. Nothing lighter than this is ever used for text. */
  ink3: string;
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
  /** The reaction chips' resting state. */
  react: string;
  /** Reaction buttons in their selected state. */
  reactOnBorder: string;
  reactOnBg: string;

  // Buttons.
  primary: string;
  onPrimary: string;
  warm: string;
  onWarm: string;
  deep: string;
  onDeep: string;
  green: string;
  onGreen: string;
  /** The inverted button — the ＋ fab and the on-tone chips. */
  inverse: string;
  onInverse: string;

  /** Text fields on a card or sheet. */
  field: string;
  link: string;

  /** The bottom sheet's own surface. */
  sheet: string;
  /** The sheet's grab handle. */
  grab: string;
  /** The scrim behind a sheet or the drawer. */
  scrim: string;
  scrimOpacity: number;

  /** The on-campus window strip. */
  window: string;
  onWindow: string;
  onWindowSub: string;
  windowDot: string;

  tones: Record<V2ToneKey, V2Tone>;
}

/** The `--mb-*` furniture the member and full-timer shells scroll through. */
export interface V2WidgetLayer {
  /** A widget's own sheet. */
  bg: string;
  /** The quiet variant. */
  tile: string;
  ink: string;
  ink2: string;
  /** The widget layer's ink floor. */
  ink3: string;
  /** The hairline between two rows in a widget. */
  line: string;
  /** The unread badge and the "due" kicker. */
  warm: string;
  /** The violet ground under a deep widget. */
  deep: string;
  onDeep: string;
  /** Your own message bubble. */
  mine: string;
  onMine: string;
  shadow: V2ShadowStyle;
}

export interface V2Palette {
  room: V2RoomLayer;
  card: V2CardLayer;
  widget: V2WidgetLayer;
}

// ── Bento (light) ──────────────────────────────────────────────────────────
const shadowFlat: V2ShadowStyle = {
  shadowColor: '#000',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
};

const roomLight: V2RoomLayer = {
  bg: '#F6F8FB',
  ink: '#1A212B',
  ink2: '#525E6F',
  ink3: '#728197',
  faint: '#728197',
  chip: 'rgba(23, 33, 43, 0.06)',
  datebox: '#FFFFFF',
  dateboxLine: '#ECEFF4',
  mark: '#5C17E5',
  onMark: '#FFFFFF',
};

const roomDark: V2RoomLayer = {
  bg: '#1A212B',
  ink: '#F6F8FB',
  ink2: '#B6C2D3',
  ink3: '#9AA8BC',
  faint: '#9AA8BC',
  chip: 'rgba(246, 248, 251, 0.08)',
  datebox: '#27313F',
  dateboxLine: '#333E4C',
  mark: '#5C17E5',
  onMark: '#FFFFFF',
};

const cardLight: V2CardLayer = {
  bg: '#FFFFFF',
  bg2: '#F6F8FB',
  ink: '#1A212B',
  ink2: '#525E6F',
  ink3: '#728197',
  line: '#ECEFF4',
  border: '#DEE4ED',

  ask: '#5C17E5',
  said: '#525E6F',
  why: '#525E6F',
  quoteLine: '#ECEFF4',
  note: '#F6F8FB',
  noteLabel: '#728197',
  noteInk: '#525E6F',
  react: '#F6F8FB',
  reactOnBorder: '#5C17E5',
  reactOnBg: 'rgba(92, 23, 229, 0.08)',

  primary: '#5C17E5',
  onPrimary: '#FFFFFF',
  warm: '#BA5900',
  onWarm: '#FFFFFF',
  deep: '#5C17E5',
  onDeep: '#FFFFFF',
  green: '#016A1C',
  onGreen: '#FFFFFF',
  inverse: '#1A212B',
  onInverse: '#F6F8FB',

  field: '#F6F8FB',
  link: '#5C17E5',

  sheet: '#FFFFFF',
  grab: '#DEE4ED',
  scrim: '#1A212B',
  scrimOpacity: 0.5,

  window: '#5C17E5',
  onWindow: '#FFFFFF',
  onWindowSub: '#EDE7FF',
  windowDot: '#B9A6FF',

  tones: {
    follow: { band: '#FBE8DE', text: '#8C3A16', dot: '#C9622F' },
    ask: { band: '#ECE9FB', text: '#5C17E5', dot: '#5C17E5' },
    due: { band: '#FCEED4', text: '#8A6410', dot: '#C99A2F' },
    pray: { band: '#EFE9F7', text: '#5C4478', dot: '#8D7AA8' },
    note: { band: '#E5F0E6', text: '#2E5C3C', dot: '#5C8A6C' },
  },
};

const cardDark: V2CardLayer = {
  bg: '#27313F',
  bg2: '#202936',
  ink: '#F6F8FB',
  ink2: '#B6C2D3',
  ink3: '#9AA8BC',
  line: '#333E4C',
  border: '#3C4959',

  ask: '#9A8FFF',
  said: '#B6C2D3',
  why: '#B6C2D3',
  quoteLine: '#333E4C',
  note: '#202936',
  noteLabel: '#9AA8BC',
  noteInk: '#B6C2D3',
  react: '#202936',
  reactOnBorder: '#9A8FFF',
  reactOnBg: 'rgba(154, 143, 255, 0.18)',

  primary: '#5C17E5',
  onPrimary: '#FFFFFF',
  warm: '#F2930D',
  onWarm: '#1A212B',
  deep: '#5C17E5',
  onDeep: '#FFFFFF',
  green: '#51E098',
  onGreen: '#1A212B',
  inverse: '#F6F8FB',
  onInverse: '#1A212B',

  field: '#202936',
  link: '#9A8FFF',

  sheet: '#27313F',
  grab: '#3C4959',
  scrim: '#04080E',
  scrimOpacity: 0.6,

  window: '#5C17E5',
  onWindow: '#FFFFFF',
  onWindowSub: '#EDE7FF',
  windowDot: '#B9A6FF',

  tones: {
    follow: { band: '#3A2518', text: '#E2A87C', dot: '#C9622F' },
    ask: { band: '#252A3D', text: '#9A8FFF', dot: '#9A8FFF' },
    due: { band: '#33291A', text: '#DFBC70', dot: '#C99A2F' },
    pray: { band: '#2A2338', text: '#C2ABDD', dot: '#9784B3' },
    note: { band: '#1E2C21', text: '#A5C5A8', dot: '#75A078' },
  },
};

const widgetLight: V2WidgetLayer = {
  bg: '#FFFFFF',
  tile: '#F6F8FB',
  ink: '#1A212B',
  ink2: '#525E6F',
  ink3: '#728197',
  line: '#ECEFF4',
  warm: '#BA5900',
  deep: '#5C17E5',
  onDeep: '#FFFFFF',
  mine: '#5C17E5',
  onMine: '#FFFFFF',
  shadow: shadowFlat,
};

const widgetDark: V2WidgetLayer = {
  bg: '#27313F',
  tile: '#202936',
  ink: '#F6F8FB',
  ink2: '#B6C2D3',
  ink3: '#9AA8BC',
  line: '#333E4C',
  warm: '#F2930D',
  deep: '#5C17E5',
  onDeep: '#FFFFFF',
  mine: '#9A8FFF',
  onMine: '#1A212B',
  shadow: shadowFlat,
};

const bentoLight: V2Palette = { room: roomLight, card: cardLight, widget: widgetLight };
const bentoDark: V2Palette = { room: roomDark, card: cardDark, widget: widgetDark };

/** Which room a v2 screen is standing in. Retained from the earlier v2 pass for
 *  API stability — under Bento every role shares one room, so this no longer
 *  changes the palette, but screens still declare it for their `<Room>` wrapper. */
export type V2Room = 'queue' | 'ft';

/** Room tint option (green vs navy/blue room tint). Retained for API stability;
 *  Bento ignores it. */
export type V2RoomTint = 'green' | 'blue';

export function roomForRole(role: AppRole | string | null | undefined): V2Room {
  return shellForRole(role) === 'ft' ? 'ft' : 'queue';
}

/** The shared `<Sheet>` chrome, off the CARD layer, so a sheet's paper, its
 *  24px corners, its grab handle and its scrim all move together. */
export function v2SheetChrome(c: V2Palette) {
  return {
    backgroundColor: c.card.sheet,
    radius: 24,
    handleColor: c.card.grab,
    scrimColor: c.card.scrim,
    scrimOpacity: c.card.scrimOpacity,
  };
}

export function getV2Palette(_room: V2Room, mode: ThemeMode, _tint: V2RoomTint = 'green'): V2Palette {
  // Bento: one room for every role and tint — only light/dark differ.
  return mode === 'light' ? bentoLight : bentoDark;
}

/** Screens declare their room by wrapping themselves in a provider; everything
 *  below reads it. */
export const V2RoomContext = createContext<V2Room>('queue');

/** Context for room tint preference ('green' | 'blue'). Defaults to 'green'. */
export const V2RoomTintContext = createContext<V2RoomTint>('green');

// Lexend only — 400 body / 500 label / 600 structural. No serif.
export const v2Font = {
  medium: 'Lexend_500Medium',
  semi: 'Lexend_600SemiBold',
  bold: 'Lexend_600SemiBold',
  extra: 'Lexend_600SemiBold',
  serif: 'Lexend_500Medium',
} as const;

// Bento shape: 16px for anything interactive, 24px for containers.
export const v2Radius = {
  card: 24,
  hero: 24,
  badge: 8,
  button: 16,
  note: 16,
  tile: 16,
  row: 16,
  chip: 999,
} as const;

// Bento cards are flat — only the FAB keeps a small lift.
export const v2Shadow = {
  card: { ...shadowFlat },
  soft: { ...shadowFlat },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

export interface V2Theme {
  mode: ThemeMode;
  room: V2Room;
  tint: V2RoomTint;
  c: V2Palette;
  font: typeof v2Font;
  radius: typeof v2Radius;
  shadow: typeof v2Shadow;
  /** The design's type scale: every font size in a v2 component passes through
   *  here so tall/short phones scale together (`fontSize: fs(20)`). */
  fs: (drawnSize: number) => number;
}

/** One hook for every v2 component. Follows the app's light/dark the same way
 *  the rest of the app does. */
export function useV2Theme(roomOverride?: V2Room, tintOverride?: V2RoomTint): V2Theme {
  const { mode } = useTheme();
  const contextRoom = useContext(V2RoomContext);
  const contextTint = useContext(V2RoomTintContext);
  const room = roomOverride ?? contextRoom;
  const tint = tintOverride ?? contextTint;
  // The design's `--m2-fs: clamp(11px, 1.6vh, 13px)` — 13px on a normal phone,
  // easing to 11px on a short one so tall screens scroll less.
  const scale = v2FontScale(useWindowDimensions().height);

  return useMemo(
    () => ({
      mode,
      room,
      tint,
      c: getV2Palette(room, mode, tint),
      font: v2Font,
      radius: v2Radius,
      shadow: v2Shadow,
      fs: (drawnSize: number) => drawnSize * scale,
    }),
    [mode, room, tint, scale],
  );
}
