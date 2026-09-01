# 0003: The navigation rail becomes a floating slab with its own token namespace

## Status
Accepted

## Context
The desktop rail shipped in #664/#665 as a flush column: `bg-surface`, a
`border-outline-variant` right edge, full height, sticky. In light that is
`#F4F4F5` on white; in dark, `#161618` on `#0A0A0B`. Both sit about four points
of L* from the page, so the rail has never read as a distinct object in either
theme — it reads as a slightly different wall.

The Ink canvas describes something else. `NavPref.dc.html`, `Home.dc.html` and
`Shells.dc.html` all draw a near-black rail, inset from the page with a gutter
of white around it, at `--radius-xl` with a shadow. That drawing predates the
rail's implementation; it was designed and never built (`DRIFT.md` #1).

The question that surfaced this was about dark mode specifically: dark felt
weaker than light. It turned out to be weaker than the *drawing* of light, not
weaker than light — neither theme ever had the slab. Four directions were drawn
(`docs/design/ink-dark/Directions.dc.html`): raise the rail's value, float it,
invert it to near-white, or remove the fill entirely. Floating was chosen.

The complication is that a black rail on a white page is an **inverted surface**,
and dark cannot copy it — the page there is already the darkest value available,
so a "darker slab" is not expressible. The two themes have to reach the same
result by opposite moves: light drops the rail below the page, dark raises it
above the cards.

## Decision
1. **The rail floats.** `App.tsx`'s rail branch becomes a `p-4 gap-4` track; the
   rail is `rounded-xl shadow-shell h-full` with no border. The gutter of page
   colour around it is what makes the slab an object rather than a wall.
2. **The rail gets its own token namespace** — `--rail`, `--rail-on`,
   `--rail-on-dim`, `--rail-hover`, `--rail-selected`, `--rail-on-selected`,
   `--rail-line` — defined in both theme blocks. Light: a `#0A0A0B` slab with
   white inks. Dark: a `#202023` slab, one step above the cards, with the normal
   dark inks. `NavRail.tsx` names the same tokens in both themes and contains no
   theme branching.
3. **`--shadow-shell` is added**, the token the Ink spec promised and never got.
4. **The chrome strip stops being a bar.** With no wall to be the edge of, a
   full-bleed `bg-surface` strip with a bottom rule reads as a leftover. It
   becomes an unfilled row; its controls carry their own surface.
5. **The design canvas is normative for shell chrome**, not just the written
   spec. Drift #1 persisted because the specs describe the rail's *behaviour*
   exhaustively and its *appearance* not at all, so nothing in prose was ever
   contradicted. `docs/design/DRIFT.md` is the register that makes the drawings
   answerable.

## Consequences
- **Light mode changes for every user.** This is not a dark-mode fix; the black
  rail is the larger visual change of the two, and it is the one nobody asked
  for. It is also the one that makes the two themes the same design.
- **Seven tokens now live in two theme blocks and must move together.** A value
  added to one and not the other fails silently in the theme that was missed —
  the same class of defect as `--surface-container-high` (`DRIFT.md` #3).
- **The rail lost 32px of height** to the gutter. Its destination list already
  overflowed a 13-inch viewport for a Full-timer and scrolls internally; it now
  starts scrolling slightly sooner. Fixing the item radius (`DRIFT.md` #4) in the
  same change gives some of that back, since 14px squares pack no differently
  but the collapsed rail no longer reads as a column of circles.
- **`bg-primary` is no longer the rail's selected fill.** Anything added to the
  rail later must use the rail namespace; reaching for `bg-primary` or
  `text-on-surface-variant` inside the rail will now look wrong in light and
  invisible in dark. The existing call sites are all converted.
- Chosen over raising the rail's value in place (direction A, one class, but a
  smaller step and it puts the rail lighter than the cards in dark, inverting
  light's relationship); over a near-white rail in dark (direction C, the
  literal mirror, but a 232px column at full brightness is what dark mode exists
  to avoid); and over removing the fill (direction D, coherent, but it answers
  the opposite of the question and drifts the two themes further apart). All
  three are kept on the canvas.
