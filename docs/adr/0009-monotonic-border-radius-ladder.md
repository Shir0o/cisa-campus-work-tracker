# 0009: Monotonic border radius ladder and component shape nesting

## Status
Accepted

## Context
Issue [#688](https://github.com/Shir0o/cisa-campus-work-tracker/issues/688) reported that the feedback note popup's textarea and other inputs appeared awkwardly rounded or lozenge-shaped ("too round"). This stemmed from the Ink design system re-valuing only a subset of radius tokens in `@theme` (`--radius-sm: 10px`, `--radius: 14px`, `--radius-lg: 24px`, `--radius-xl: 32px`) while leaving Tailwind defaults for `--radius-md` (6px), `--radius-2xl` (16px), and `--radius-3xl` (24px).

This produced a non-monotonic ladder (`10px -> 6px -> 14px -> 24px -> 32px -> 16px -> 24px`) documented in `docs/design/prayer-composer/Ladder.dc.html`. Short controls and inputs (<60px height) that used `rounded-xl` (32px) or `rounded-2xl` clamped to 50% height in CSS, rendering as stadiums rather than rounded rectangles (the same defect previously resolved for prayer composers in [#705](https://github.com/Shir0o/cisa-campus-work-tracker/issues/705)).

## Decision

1. **Re-base the full Tailwind radius ladder monotonically on `@theme` in `src/index.css`:**
   - `--radius-sm`: `10px` (small marks, thumbnails, photo dropzones, compact inputs/controls)
   - `--radius-md`: `12px` (intermediate controls)
   - `--radius`: `14px` (Ink interactive token: buttons, tabs, inner nested panels)
   - `--radius-lg`: `20px` (sub-containers, embedded cards)
   - `--radius-xl`: `24px` (cards, modal dialogs, flyout sheets)
   - `--radius-2xl`: `32px` (shell-level floating slabs, such as the floating nav rail)
   - `--radius-3xl`: `40px` (large outer boundaries)
   - `--radius-full`: keeps `9999px` (pills, avatars, circular icon buttons)

2. **Establish the strict component shape nesting hierarchy:**
   - **Shell / Slab**: `32px` (`rounded-2xl` or `rounded-[32px]`)
   - **Card / Modal**: `24px` (`rounded-xl` or `rounded-[24px]`)
   - **Nested Panel**: `14px` (`rounded` or `rounded-[14px]`)
   - **Control / Input**: `10px` (`rounded-sm` or `rounded-[10px]`)
   - **Pill / Avatar / Badge**: `rounded-full`

3. **Update components and shell chrome:**
   - NavRail moves from `rounded-xl` to `rounded-2xl` so its floating slab remains 32px (`--radius-2xl`).
   - Modal dialogs and feedback sheets standardize on 24px (`rounded-xl`).
   - Form inputs, textareas, and short controls standardize on 10px (`rounded-sm`), preventing any lozenge/stadium clamps.
