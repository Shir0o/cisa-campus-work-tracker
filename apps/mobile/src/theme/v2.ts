// Mobile v2 — the visual language, ported from the Claude Design project's
// mobile.css (`.m2.deck`, the green room), mobile-night.css (`.m2.night`) and
// mobile-blue.css (`.m2.blue`, the navy tint). See MOBILE-V2.md there.
//
// This is DELIBERATELY separate from tokens.ts: v2 does not inherit the Field
// Notes / Material palette, and every other screen in the app still depends on
// that one. Only v2 components read from here.
//
// ── THREE LAYERS, because the design has three ─────────────────────────────
// The design stacks its class list on ONE root element — the trainee is
// `m2 deck`, a member is `m2 deck mem`, the full-timer is `m2 deck mem ft blue`
// — so three independent token sets land on the same node and disagree with
// each other. A flat palette can only be right about one of them at a time,
// which is how member widgets ended up on the trainee's white card and how a
// person screen pushed from the full-timer's tabs ended up in paper ink.
//
//   c.room   — the ROOM the screen stands in. `.m2.deck`'s background and ink
//              for the trainee and members; `--mb-room`/`--mb-ink*` for the
//              full-timer's paper. Also `datebox` and `mark`, which sit on the
//              room rather than on any card. Varies by room × tint × mode.
//
//   c.card   — `.m2.deck`'s own tokens: the focus card, the bottom sheets, and
//              every pushed `.m2c-*`/`.m2p-*` person screen. ALL THREE shells
//              carry `deck`, so this is shared between them and varies by
//              tint × mode ONLY — it is not restated per room.
//
//   c.widget — `--mb-*`, declared by `.m2.mem`: the furniture the shells that
//              SCROLL are built from (`.mbr-*`, `.ftw*`, `.ft-tile`, `.ft-gl`,
//              `.ft-chip`, `.ft-more-i`). The trainee's queue has none of it,
//              but members stand in the trainee's room, so every room carries
//              one. Varies by shell look × tint × mode.
//
// Where they disagree, in the design's own values: the green room's widget card
// is cream (#f4f1e6) where the deck card beside it is white; the full-timer's
// widgets take warm paper ink (#1b1a18/#524d47/#8d8880) where a person screen
// pushed off the same tab bar keeps `.m2.deck.blue`'s navy
// (#17293f/#607182/#7e8598). A component reads the layer it IS.
//
// TWO ROOMS (see V2Room below):
//   • 'queue' — the trainee's AND the members' deep-green room. `mem` adds the
//               widget LAYER to the trainee's room; it does not change rooms.
//   • 'ft'    — the full-timer's room: warm paper with white widgets by day,
//               near-black navy by night. Direction 05, "Widgets".
//
// Hard rules the design carries, everywhere (do not relax them):
//   • every touch target ≥ 44px
//   • no text ink lighter than its own layer's `ink3`
//   • a card's foot never scrolls — only its body does
//
// One rule belongs to the TRAINEE's room alone: no metrics, no KPI tiles, no
// recurring gatherings. The full-timer's room departs from it on purpose — its
// "At a glance" tiles and week-ahead strip ARE direction 05.
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
 *  Android. The design's `box-shadow`s don't map 1:1, so these are the closest
 *  equivalents rather than conversions. */
export interface V2ShadowStyle {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

/** The ROOM a v2 screen stands in — its ground and the ink that reads on it.
 *
 * `.m2.deck`'s `background`/`color` for the trainee and members;
 * `.m2.mem.ft.blue`'s `--mb-room`/`--mb-ink*` for the full-timer's paper.
 * `datebox` and `mark` live here rather than on `card` because the design puts
 * them straight on the room — `.m2-datebox` is a translucent cut-out of it and
 * `.m2-mark` is deliberately its opposite. */
export interface V2RoomLayer {
  bg: string;
  /** `--mb-ink` — headings on the room. */
  ink: string;
  /** `--mb-ink3` — the quiet line under them. */
  ink2: string;
  /** `--mb-ink4` — the room's ink floor. Nothing lighter is used for text. */
  ink3: string;
  /** The floor line under the up-next faces (`.m2-heldnote`). */
  faint: string;
  /** Tint behind the ☰-style circular chrome buttons (`.m2-mn`, `.m2-back`). */
  chip: string;
  /** The "Dates worth knowing" block, which sits on the room, not on a card. */
  datebox: string;
  dateboxLine: string;
  /** The all-clear mark. Sits on the ROOM, so it inverts in light (cream on
   *  green) but goes to the primary green at night — it is not `card.primary`. */
  mark: string;
  onMark: string;
}

/** `.m2.deck`'s tokens — the focus card, the bottom sheets, and every pushed
 * `.m2c-*` / `.m2p-*` person screen.
 *
 * Shared by all three shells, because all three roots carry `deck`. That is why
 * this varies by tint × mode only: a contact opened from the full-timer's tabs
 * and the same contact opened from the trainee's drawer are the same surface. */
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
  /** The reaction chips' resting state. A shade off `bg2`: on the white card
   * the notes/about tint would read as a filled button. */
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
  /** The inverted "black" button — the ＋ fab and the on-tone chips. */
  inverse: string;
  onInverse: string;

  /** Text fields on a card or sheet (`.m2-input`, `.m2-ta`). */
  field: string;
  link: string;

  /** The bottom sheet's own surface (`.m2-sheet`) — cream paper in the light
   * rooms, `--n-sheet` at night. NOT `bg`: the focus card went white in the
   * Jul-26 revision and the sheet deliberately stayed paper. */
  sheet: string;
  /** The sheet's grab handle (`.m2-grab`). */
  grab: string;
  /** The scrim behind a sheet or the drawer (`.m2-sheetwrap` / `.m2-scrim`), as
   * a solid colour — `scrimOpacity` carries the alpha separately so an entrance
   * animation can interpolate it. */
  scrim: string;
  scrimOpacity: number;

  /** The on-campus window strip. */
  window: string;
  onWindow: string;
  onWindowSub: string;
  windowDot: string;

  tones: Record<V2ToneKey, V2Tone>;
}

/** The design's `--mb-*` block — the furniture the member and full-timer shells
 * scroll through. Declared by `.m2.mem`, re-pointed by `.m2.mem.blue`,
 * `.m2.mem.night` and `.m2.mem.ft.blue`.
 *
 * NOT the deck's card: the two sit on the same root element and disagree.
 * `.mbr-next` is cream on the green room while `.m2-card` beside it is white,
 * and `.ftw` is near-black warm ink while `.m2c-hero` pushed from the same tab
 * bar is navy.
 *
 * `--mb-prim` / `--mb-onprim` are deliberately absent: the design declares them
 * in every `--mb-*` block but no rule in mobile.css or views/mobile/ft.jsx ever
 * reads them. */
export interface V2WidgetLayer {
  /** `--mb-card` — a widget's own sheet. */
  bg: string;
  /** `--mb-tile` — the quiet variant (`.ft-tile.quiet`, `.mbr-inv`, `.mbr-quote`). */
  tile: string;
  /** `--mb-cink` */
  ink: string;
  /** `--mb-cink2` */
  ink2: string;
  /** `--mb-cink3` — the widget layer's ink floor. */
  ink3: string;
  /** `--mb-line` — the hairline between two rows in a widget. */
  line: string;
  /** `--mb-warm` — the unread badge and the "due" kicker. It does NOT follow
   * `card.warm`, which moves to #b3562b at night while this stays put. */
  warm: string;
  /** `--mb-deep` — the violet ground under `.ftw.deep`. Same story: `card.deep`
   * moves at night, this does not. */
  deep: string;
  /** `.ftw.deep`'s own ink. */
  onDeep: string;
  /** `--mb-mine` — your own message bubble (`.mbr-bub.mine`). */
  mine: string;
  /** `--mb-minek` — and its ink. */
  onMine: string;
  /** `--mb-shadow`. The member's is a deep 32px drop; the full-timer's and both
   * night rooms are a near-hairline. */
  shadow: V2ShadowStyle;
}

export interface V2Palette {
  room: V2RoomLayer;
  card: V2CardLayer;
  widget: V2WidgetLayer;
}

// ── `--mb-shadow`, per widget layer ────────────────────────────────────────
// `0 14px 32px -18px rgba(0,0,0,.5)` — the member's deep, soft grounding.
const widgetDropShadow: V2ShadowStyle = {
  shadowColor: '#000',
  shadowOpacity: 0.28,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 7 },
  elevation: 5,
};
// `0 1px 2px rgba(24,22,20,.05), 0 8px 20px -12px rgba(24,22,20,.22)` — the
// full-timer's paper room, where a white widget only needs lifting off #eceae6.
const widgetPaperShadow: V2ShadowStyle = {
  shadowColor: '#181614',
  shadowOpacity: 0.13,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};
// `var(--n-soft)` = `0 1px 2px rgba(0,0,0,.4)`.
const widgetNightShadow: V2ShadowStyle = {
  shadowColor: '#000',
  shadowOpacity: 0.4,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
};

// ── the CARD layer (`.m2.deck …`) ──────────────────────────────────────────

const cardGreen: V2CardLayer = {
  bg: '#ffffff',
  bg2: '#f4f2ee',
  ink: '#16332b',
  ink2: '#5f7a68',
  ink3: '#7d8b7f',
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
  reactOnBorder: '#16332b',
  reactOnBg: '#e3ebe1',

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

  field: '#fbfaf8',
  link: '#2b4a6e',

  sheet: '#f4f1e6',
  grab: '#d6cfba',
  scrim: '#091a15',
  scrimOpacity: 0.55,

  window: '#c9622f',
  onWindow: '#ffffff',
  onWindowSub: '#ffe3d1',
  windowDot: '#ffd9bf',

  tones: {
    follow: { band: '#fbeee4', text: '#a8501f', dot: '#c9622f' },
    ask: { band: '#e9eef5', text: '#2b4a6e', dot: '#2b4a6e' },
    due: { band: '#faf0da', text: '#8a6410', dot: '#c99a2f' },
    pray: { band: '#efe9f5', text: '#5c4478', dot: '#8d7aa8' },
    note: { band: '#e8efe8', text: '#3c5c40', dot: '#6c8f6f' },
  },
};

// `.m2.deck.blue:not(.night)` — the cream paper and every interior tint stay
// put; only the ink goes navy. mobile-blue.css does not restate the sheet or
// its handle, so those keep `.m2.deck`'s cream.
const cardBlue: V2CardLayer = {
  ...cardGreen,

  ink: '#17293f',
  ink2: '#607182',
  ink3: '#7e8598',
  said: '#1f3145',
  why: '#2d4055',
  noteInk: '#3c4a5d',
  reactOnBorder: '#17293f',
  reactOnBg: '#dfe6ee',

  primary: '#17293f',
  inverse: '#17293f',
  onInverse: '#f4f1e6',

  scrim: '#09121f',
};

// `.m2.night` — the room goes near-black green and the sheet goes dark with it.
const cardNightGreen: V2CardLayer = {
  bg: '#1b2a23',
  bg2: '#243429',
  ink: '#eaefe9',
  ink2: '#ccd6cf',
  ink3: '#8e9a92',
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
  reactOnBorder: '#93b8de',
  reactOnBg: '#1c2836',

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

  field: '#243429',
  link: '#93b8de',

  sheet: '#16221c',
  grab: '#3a4a42',
  scrim: '#040a08',
  scrimOpacity: 0.62,

  window: '#a94f26',
  onWindow: '#ffffff',
  onWindowSub: '#ffe3d1',
  windowDot: '#ffd9bf',

  tones: {
    follow: { band: '#33221a', text: '#e2a87c', dot: '#c9622f' },
    ask: { band: '#1c2836', text: '#9dbde0', dot: '#7ba3d0' },
    due: { band: '#322916', text: '#dfbc70', dot: '#c99a2f' },
    pray: { band: '#29203a', text: '#c2abdd', dot: '#9784b3' },
    note: { band: '#1c2a1f', text: '#a5c5a8', dot: '#75a078' },
  },
};

// `.m2.blue.night` — one token block re-pointing `--n-*` from near-black green
// to near-black navy. `--n-prim` moves but its ON-colour does not: `.m2-b1`
// keeps #eaf3ec in both tints.
const cardNightBlue: V2CardLayer = {
  ...cardNightGreen,

  bg: '#1a2433',
  bg2: '#232f41',
  ink: '#e9edf4',
  ink2: '#ccd4e0',
  ink3: '#8e97a6',
  line: 'rgba(233,237,244,0.10)',
  border: '#313c4e',

  said: '#ccd4e0',
  why: '#ccd4e0',
  quoteLine: '#313c4e',
  note: '#232f41',
  noteLabel: '#8e97a6',
  noteInk: '#ccd4e0',
  react: '#232f41',

  primary: '#31506e',
  inverse: '#e9edf4',
  onInverse: '#0a1220',

  field: '#232f41',

  sheet: '#15202e',
  grab: '#3a4450',
  scrim: '#04080e',
};

// ── the ROOM layer ─────────────────────────────────────────────────────────
// `ink2`/`ink3` follow the design's `--mb-ink3`/`--mb-ink4`; `--mb-ink2` has no
// slot here (nothing in the port reads it yet).

const roomGreen: V2RoomLayer = {
  bg: '#16332b',
  ink: '#eef1e9',
  ink2: '#9fbfa8',
  ink3: '#7fa189',
  faint: '#8dae97',
  chip: 'rgba(238,241,233,0.10)',
  datebox: 'rgba(244,241,230,0.07)',
  dateboxLine: 'rgba(244,241,230,0.12)',
  mark: '#f4f1e6',
  onMark: '#16332b',
};

const roomBlue: V2RoomLayer = {
  bg: '#17293f',
  ink: '#e9edf3',
  ink2: '#9db4cd',
  ink3: '#7d96b2',
  faint: '#8ba4c1',
  chip: 'rgba(233,237,243,0.10)',
  datebox: 'rgba(233,237,243,0.07)',
  dateboxLine: 'rgba(233,237,243,0.12)',
  mark: '#17293f',
  onMark: '#f4f1e6',
};

const roomNightGreen: V2RoomLayer = {
  bg: '#0b1611',
  ink: '#eaefe9',
  ink2: '#ccd6cf',
  ink3: '#a3afa7',
  faint: '#8e9a92',
  chip: 'rgba(234,239,233,0.08)',
  datebox: '#1b2a23',
  dateboxLine: 'rgba(234,239,233,0.10)',
  mark: '#31614e',
  onMark: '#eaf3ec',
};

const roomNightBlue: V2RoomLayer = {
  ...roomNightGreen,

  bg: '#0a1220',
  ink: '#e9edf4',
  ink2: '#ccd4e0',
  ink3: '#a3adbc',
  // `.m2.blue.night`'s own `--n-ink4`. The navy night floor is a shade cooler
  // than the green one (#8e9a92) — the two are not interchangeable.
  faint: '#8e97a6',
  // `.m2-mn` is not restated by mobile-blue.css, so the chrome tint stays
  // `.m2.night`'s.
  datebox: '#1a2433',
  dateboxLine: 'rgba(233,237,244,0.10)',
  mark: '#31506e',
};

// `.m2.mem.ft.blue:not(.night)`'s `--mb-*` block: the warm PAPER room of
// "Mobile Today - hybrid" state B — near-black warm ink on #eceae6, with navy
// only as an accent. NOT the navy-inked room the blue tint gives the trainee.
const roomFtPaper: V2RoomLayer = {
  bg: '#eceae6',
  ink: '#1b1a18',
  ink2: '#6a645c',
  ink3: '#8d8880',
  faint: '#8d8880',
  // No `--mb-chip` in the design; the nearest counterpart is `.mbr-tabs
  // button.on`'s 9% navy.
  chip: 'rgba(23,41,63,0.06)',
  // `.m2-datebox` is a translucent cut-out of the room, which on paper vanishes
  // — Gatherings, pushed off this tab bar, would lose its ground. It stands as a
  // white block here instead. (The week-ahead strip is NOT this: `.ft-chip` is a
  // widget card and reads `widget.bg`.)
  datebox: '#ffffff',
  dateboxLine: '#e6e3dc',
  mark: '#17293f',
  onMark: '#f4f1e6',
};

// ── the WIDGET layer (`--mb-*`) ────────────────────────────────────────────
// `warm` and `deep` are constant across all five: `.m2.mem.night` maps most of
// the block onto `--n-*` but leaves those two alone, so at night they part
// company with `card.warm` (#b3562b) and `card.deep` (#5b4780).

const widgetGreen: V2WidgetLayer = {
  bg: '#f4f1e6',
  tile: '#eae5d3',
  ink: '#16332b',
  ink2: '#3b5346',
  ink3: '#7d8b7f',
  line: '#ddd7c4',
  warm: '#a4562f',
  deep: '#4a3b63',
  onDeep: '#f2eef8',
  mine: '#2b4a6e',
  onMine: '#f2f5f9',
  shadow: widgetDropShadow,
};

// `.m2.mem.blue:not(.night)` — the cream paper is unchanged, only its ink and
// the bubble blue move.
const widgetBlue: V2WidgetLayer = {
  ...widgetGreen,
  ink: '#17293f',
  ink2: '#3c4a5d',
  ink3: '#7e8598',
  mine: '#35618f',
};

// `.m2.mem.night` — the `--n-*` palette, but its hairline is `--n-bd` (a solid
// border) where the deck's is the translucent `--n-line`.
const widgetNightGreen: V2WidgetLayer = {
  bg: '#1b2a23',
  tile: '#243429',
  ink: '#eaefe9',
  ink2: '#ccd6cf',
  ink3: '#8e9a92',
  line: '#31423a',
  warm: '#a4562f',
  deep: '#4a3b63',
  onDeep: '#f2eef8',
  mine: '#33587f',
  onMine: '#eaf0f7',
  shadow: widgetNightShadow,
};

// `.m2.mem.night` over `.m2.blue.night`'s `--n-*`. `--n-nav` is NOT re-pointed
// by the blue tint, so the bubble blue is the green room's.
const widgetNightBlue: V2WidgetLayer = {
  ...widgetNightGreen,
  bg: '#1a2433',
  tile: '#232f41',
  ink: '#e9edf4',
  ink2: '#ccd4e0',
  ink3: '#8e97a6',
  line: '#313c4e',
};

// `.m2.mem.ft.blue:not(.night)` — white widgets on the paper, warm ink.
const widgetFtPaper: V2WidgetLayer = {
  ...widgetGreen,
  bg: '#ffffff',
  tile: '#f5f3ef',
  ink: '#1b1a18',
  ink2: '#524d47',
  ink3: '#8d8880',
  line: '#f0eeea',
  shadow: widgetPaperShadow,
};

// ── the six palettes the app can be in ─────────────────────────────────────
// The full-timer's room is forced navy by the design (`m2 deck mem ft blue`),
// so it has no green variant. At night it IS the navy member room: there is no
// `.m2.mem.ft.night` block, so it falls through to `.m2.mem.night` over
// `.m2.blue.night`.

const queueGreenLight: V2Palette = { room: roomGreen, card: cardGreen, widget: widgetGreen };
const queueGreenDark: V2Palette = { room: roomNightGreen, card: cardNightGreen, widget: widgetNightGreen };
const queueBlueLight: V2Palette = { room: roomBlue, card: cardBlue, widget: widgetBlue };
const queueBlueDark: V2Palette = { room: roomNightBlue, card: cardNightBlue, widget: widgetNightBlue };
const ftLight: V2Palette = { room: roomFtPaper, card: cardBlue, widget: widgetFtPaper };
const ftDark: V2Palette = queueBlueDark;

/** Which room a v2 screen is standing in.
 *
 * Two, not three: the design's member shell (`m2 deck mem`) stands in the
 * TRAINEE's room and adds the `mem` widget layer over it — same background,
 * same room ink, same `.m2.deck` sheets. What members were missing was
 * `V2Palette.widget`, not a room of their own. Only `ft` moves the room. */
export type V2Room = 'queue' | 'ft';

/** Room tint option (green vs navy/blue room tint). */
export type V2RoomTint = 'green' | 'blue';

/** The room a role stands in. The design forces navy on the full-timer's app
 * alone (`m2 deck mem ft blue`); the trainee and both member roles share the
 * green room, so `shellForRole`'s 'member' folds into 'queue' here on purpose —
 * what makes a member screen a member screen is `V2Palette.widget`, which every
 * room carries.
 *
 * Screens that more than one role can reach — People, The Journey, Gatherings —
 * read this rather than hard-coding a room. */
export function roomForRole(role: AppRole | string | null | undefined): V2Room {
  return shellForRole(role) === 'ft' ? 'ft' : 'queue';
}

/** The design's `.m2-sheet` chrome, as props for the shared `<Sheet>`. Spread
 * it at every v2 call site (`<Sheet {...v2SheetChrome(c)} …>`) so the sheet's
 * paper, its 26px corners, its `.m2-grab` handle and its room-tinted scrim all
 * move together — they are one surface, and picking them off one prop at a time
 * is how the sheet ended up cream-on-Material in the first place.
 *
 * All four come off the CARD layer: a sheet is `.m2.deck` furniture, so it is
 * the same paper whichever of the three shells opened it. */
export function v2SheetChrome(c: V2Palette) {
  return {
    backgroundColor: c.card.sheet,
    radius: 26,
    handleColor: c.card.grab,
    scrimColor: c.card.scrim,
    scrimOpacity: c.card.scrimOpacity,
  };
}

export function getV2Palette(room: V2Room, mode: ThemeMode, tint: V2RoomTint = 'green'): V2Palette {
  if (room === 'ft') {
    return mode === 'light' ? ftLight : ftDark;
  }
  if (tint === 'blue') {
    return mode === 'light' ? queueBlueLight : queueBlueDark;
  }
  return mode === 'light' ? queueGreenLight : queueGreenDark;
}

/** Screens declare their room by wrapping themselves in a provider; everything
 * below reads it. A context rather than a `useV2Theme(room)` argument so the
 * shared v2 primitives (components/queue/atoms) can be reused in either room
 * without knowing which one they're in. */
export const V2RoomContext = createContext<V2Room>('queue');

/** Context for room tint preference ('green' | 'blue'). Defaults to 'green'. */
export const V2RoomTintContext = createContext<V2RoomTint>('green');

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
// closest RN equivalents (iOS shadow* / Android elevation). A widget's own drop
// is NOT here — it is `c.widget.shadow`, because the design gives it a
// different one in every room.
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
  room: V2Room;
  tint: V2RoomTint;
  c: V2Palette;
  font: typeof v2Font;
  radius: typeof v2Radius;
  shadow: typeof v2Shadow;
  /** The design's type scale (MOBILE-V2.md, "Type scale"): every font size in a
   * v2 component is a size the app was DRAWN at, and passes through here.
   * `fontSize: fs(20)`, and line heights too — scaling one without the other
   * breaks the rhythm. Plain `px` will not scale with the rest of the app. */
  fs: (drawnSize: number) => number;
}

/** One hook for every v2 component. Follows the app's light/dark the same way
 * the rest of the app does — v2 is a second palette, not a second app — and the
 * room it is standing in, which defaults to the trainee's. */
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
