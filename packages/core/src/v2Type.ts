// Mobile v2 — the type scale (the design's MOBILE-V2.md, "Type scale (Aug 2026)").
//
// The design expresses every font size in mobile.css as
// `calc(var(--m2-fs) * R)`, where R is the size the app was drawn at divided by
// 13.5 (the body size), and
//
//     :root,.m2 { --m2-fs: clamp(11px, 1.6vh, 13px) }
//
// — 13px on a normal phone, easing to 11px on a short screen so tall screens
// scroll less and short ones don't overflow. React Native has no vh unit and no
// clamp(), so the same rule lives here as a pure function of the window height
// in points, which is what `useWindowDimensions().height` reports and is
// directly comparable to the CSS px of the design's phone frame.

/** The body size mobile v2 was drawn at. Every literal size in a v2 component
 * is a size at THIS base, and is scaled from it. */
export const V2_DRAWN_BASE = 13.5;

/** The design's `clamp(11px, 1.6vh, 13px)` floor and ceiling. */
const V2_FS_MIN = 11;
const V2_FS_MAX = 13;
const V2_FS_VH = 0.016;

/** The multiplier a mobile v2 size drawn at `V2_DRAWN_BASE` should be given, for
 * a window of `windowHeight` points. A degenerate height (0, NaN — RN can report
 * either before first layout) falls back inside the clamp rather than
 * collapsing the type. */
export function v2FontScale(windowHeight: number): number {
  const fromViewport = Number.isFinite(windowHeight) ? windowHeight * V2_FS_VH : V2_FS_MAX;
  const base = Math.min(V2_FS_MAX, Math.max(V2_FS_MIN, fromViewport));
  return base / V2_DRAWN_BASE;
}

/** One size, scaled — `v2FontSize(20, height)` for a heading drawn at 20px.
 * Line heights go through here too, or the rhythm breaks. */
export function v2FontSize(drawnSize: number, windowHeight: number): number {
  return drawnSize * v2FontScale(windowHeight);
}
