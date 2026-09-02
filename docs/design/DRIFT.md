# Design/build drift register

A living record of places where the design artefacts and the shipped code
disagreed, which one was right, and how it was settled.

## Why this file exists

The design sources under `docs/design/` are HTML artboards. Nobody diffs them
against the application, and nothing fails when they stop describing it. That is
not a flaw in the drawings — a canvas that could be diffed against React would
just be React — but it means drift is found by accident, usually months later
and usually by someone looking at something else.

The nine entries below were all found in one sitting, prompted by a question
about dark mode: eight by reading the artboards and the specs against the source
line by line, and one (#9) only by walking the running app in both themes.
Three were real bugs, three were the build ignoring a written decision, one was a
token that was specified and never added, one was a spec the build had quietly
improved on, and one was the whole shell. The point of writing them down
is so the next set is found on purpose.

**When you change shell chrome, tokens, or anything the artboards draw, add a
row here.** Say which artefact was right. "The build was right and the drawing
is stale" is a legitimate and common answer — see #8.

## Register

### 2026-09-01 — the dark-mode review

Found reviewing the rail in dark; settled together in one branch. Sources:
[`ink-dark/Findings.dc.html`](ink-dark/Findings.dc.html) for 3, 6 and 7,
[`ink-dark/Directions.dc.html`](ink-dark/Directions.dc.html) for 1.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 1 | The rail shipped as a flush `bg-surface` column with a right border. `ink/NavPref.dc.html`, `ink/Home.dc.html` and `ink/Shells.dc.html` all draw a near-black slab, floating, 32px radius, with a shadow — in light. It was never built, in either theme. | **Design** | Built as direction B, with a dedicated rail token namespace so light gets the black slab and dark gets a raised one. [ADR 0003](../adr/0003-nav-rail-floating-shell.md). |
| 2 | `docs/specs/ink-design-system.md` says "A shell-level shadow token is added for raised chrome." No such token was ever added. | **Spec** | `--shadow-shell` added to both theme blocks and to `@theme`. The floating rail is its first consumer. |
| 3 | `.dark` pointed `--surface-container-high` and `-highest` at `--bg-elev`, which is the same value as `--panel`. Every `hover:bg-surface-container-high` on a `bg-surface` parent therefore painted the surface its own colour — the raised state was a no-op across 200 usages in 44 files. Light has always pointed at `--panel-2`. | **Neither — a bug** | Both now point at `--panel-2` in dark, matching light. |
| 4 | Rail items used `rounded-xl`. Ink re-values `--radius-xl` to 32px for shell containers, which a 44px item clamps to a pill and a 44×44 collapsed item to a circle. The nav spec's Implementation Decisions say items are "44×44 squares at the interactive radius rather than pills, because a pill at that width reads as a circle." | **Spec** | Items and the logo tile moved to `rounded-[14px]`. `--radius-xl` is unchanged and is what the floating rail itself now uses. |
| 5 | Breakpoints. The build fell through to mobile below 768px and forced the collapsed rail from 768–1179px. The spec and `ink/NavPref.dc.html` both say below 1024px and 1024–1279px. | **Spec** | `RAIL_FITS_MIN_WIDTH` 1180 → 1280; the rail's gates moved `md` → `lg`. See the note below on what "falls through" turned out to mean. |
| 6 | The Questions unread badge was `text-on-primary` on `bg-primary/15` — a pairing that only works on top of the selected fill. On a resting item it renders ~1.6:1 in **both** themes, so the count was invisible on every destination except the one you were already looking at. | **Neither — a bug** | The badge now follows the item: inverted ink on the selected pill, rail ink on a `--rail-hover` chip otherwise. |
| 7 | `GlobalSearch`'s hover ring was a literal `#525E6F` — a Bento blue-grey, off Ink's neutral axis, and identical in both themes. One of the fourteen hardcoded hex values the Ink spec knowingly left in place. | **Neither — stale** | Moved to `--accent-line`, which is already theme-dependent. `GlobalSearch.test.tsx` pinned the literal and had to be updated; the Ink spec predicted exactly this ("a test that needs editing indicates a hardcoded colour that should have become a token"). Thirteen remain. |
| 8 | `ink/NavPref.dc.html` and the nav spec pin an account block — avatar, name, role — inside the rail. The build has no account block in the rail; the avatar lives in `NavChromeStrip`. | **Build** | The spec was internally inconsistent: it already argues that search and notifications belong to the shell so they are written once, and the avatar is the same case. The rail should not own a third copy. Spec and artboard corrected to match. |
| 9 | My Day's "Next up" card — still commented "solid violet card" — was `bg-accent-strong text-white`. `--accent-strong` is `#131316` in light and `#FAFAFA` in dark, so in dark the entire card rendered white text on a white fill: heading, body and chips all invisible. | **Neither — a bug** | Moved to the `text-accent-on` / `bg-accent-strong` pair, including the `/75`, `/80`, `/85` alpha variants and the `bg-white/15 border-white/20` chips. |
| 10 | In compact/collapsed rail mode (`rail-collapsed`), destination items used `mx-2` (left margin 8px on a 44px tile inside the 76px rail), displacing all destination glyphs 8px to the left of the centered header brand logo, Settings icon, and collapse chevron. | **Neither — a bug** | Moved to `mx-auto` when collapsed so the 44×44 square tiles sit with symmetric 16px margins, centering every icon at `x = 38px` along the rail's vertical axis. (#728) |

**#9 was found by walking the app**, not by reading it — it is the single thing on this list that no amount of comparing documents would have surfaced, and it is also the exact failure the Ink spec predicted in writing: *"Anything that hardcodes white on top of `bg-primary` instead of using `text-on-primary` breaks in dark mode."* The spec said to verify it by walking both themes. That had not been done. Do it.

One user-facing string was corrected alongside #5: Settings' navigation help said mobile navigation is used below the large breakpoint, which was never quite true and is now clearly wrong — below `lg` you get the top bar, and the bottom bar only below `md`.

#### On #5, and what "falls through to MobileNav" means

The spec says every state "falls through to the existing mobile bottom
navigation" below the large breakpoint. Read literally that would move
`MobileNav` from `md:hidden` to `lg:hidden`, which gives 768–1023px both
`TopNav`'s hamburger drawer *and* a bottom bar.

What it means in practice, and what was implemented: below `lg` the rail is not
rendered and the shell falls through to the **top-bar branch**, which already
carries its own drawer under `lg`; `MobileNav`'s bottom bar keeps its own `md`
threshold. The spec has been amended to say this.

## Guardrails that exist

- `npm run check:colors` — blocks new raw hex and raw Tailwind palette classes
  on lines added in the diff. It compares `base...HEAD`, so it sees committed
  work only. Note what it did *not* catch: #9 was `text-white`, which is a
  Tailwind utility rather than a palette class or a hex, so it passed the guard
  while being exactly the defect the guard exists to prevent. `text-white` and
  `text-black` on a themed fill are worth adding to it.
- `npm run check:i18n` — the same shape, for hardcoded UI strings.
- Nothing checks an artboard against a component, and nothing sensibly could.
  This file is the substitute, and #9 is the reminder that reading is not
  enough — the app has to be opened in both themes.
