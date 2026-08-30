# Ink — replacing the Bento design system

## Problem Statement

The CISA Campus Work Tracker currently wears "Bento": cool blue-leaning neutrals, white cards floating on a grey page, visible hairline borders on most surfaces, and violet `#5C17E5` as the one interactive colour. It is coherent, but it reads as a generic admin tool. It does not look like a product anyone chose.

Beyond taste, the current system has a concrete gap: `index.html` loads Lexend at weights 400, 500 and 600 only. There is no weight in the system heavy enough for a confident display voice, so every heading on every destination sits at the same quiet weight as the body copy around it. Headings do not lead; pages read as undifferentiated grey.

## Solution

Ink: a near-monochrome system where the shell is neutral and colour appears only where it carries meaning. White page, grey cards, borders replaced by fill contrast, black as the accent, and selection expressed as inversion rather than tint. The stage and board hues stay — they are the only chroma on screen, so their chroma goes up rather than down.

The change is almost entirely a re-valuing of tokens that already exist. Roughly 4,254 semantic utility usages across the `.tsx` files already read from these tokens (`bg-surface`, `text-on-surface-variant`, `border-outline-variant`, and so on), against only 14 hardcoded hex values and 109 raw Tailwind palette classes. Swapping the values in the `@theme` block and the two theme blocks retints the whole application without touching component markup.

The single structural inversion is that Bento's `--bg` (grey) and `--panel` (white) exchange roles. Ink is grey cards on a white page. Because every card already reads `--panel` through `bg-surface`, this is a value swap, not a markup migration.

## User Stories

1. As a Full-timer, I want the application to have a distinct visual identity, so that it feels like a considered product rather than a generic dashboard template.
2. As a Trainee, I want headings to be visibly heavier than body copy, so that I can scan a destination and find the section I need without reading every line.
3. As a Student, I want cards to separate from the page by fill rather than by hairline borders, so that dense screens feel calmer and less ruled-off.
4. As a Full-timer, I want the accent colour to be reserved rather than sprayed across every affordance, so that when something *is* emphasised I believe it matters.
5. As a Trainee, I want a selected filter chip to be unmistakably selected, so that I always know what subset of people I am looking at on The Journey.
6. As a Trainee, I want the selected row in a person-picker to be obvious, so that I do not assign a to-do to the wrong person.
7. As a Full-timer, I want stage colours on The Journey to stay vivid, so that I can still read the board's shape at a glance when everything around it has gone neutral.
8. As a Full-timer, I want the stage colours I configured to keep meaning the same thing after the redesign, so that I do not have to re-teach the board to my team.
9. As a Trainee, I want a completed to-do to read as *complete* rather than as *selected*, so that the done state is never ambiguous.
10. As a Trainee, I want overdue and needs-attention states to stay in warm signal colours, so that urgency is still legible in a monochrome interface.
11. As a Student, I want the application to remain fully usable in dark mode, so that I can use it at night without the interface fighting me.
12. As a Full-timer using dark mode, I want primary buttons to stay readable, so that I never meet a white-on-white or black-on-black control.
13. As a Trainee, I want the interface to respect my system light/dark preference as it does today, so that nothing about my existing setup changes.
14. As a Student on a phone, I want the mobile views to receive the same visual system as the web views, so that the two do not drift apart.
15. As a Community member, I want text contrast to meet accessibility expectations, so that I can read the interface comfortably.
16. As a Full-timer, I want prayer cards on "On our hearts" to keep their per-person colour marks, so that I can still tell prayers apart at a glance.
17. As a Trainee, I want form fields to show focus clearly without a coloured glow, so that keyboard navigation stays obvious in a neutral palette.
18. As a developer, I want the visual change to live in one place, so that reviewing it does not mean reading a diff across 179 component files.
19. As a developer, I want to be stopped from introducing new hardcoded colours, so that the token layer does not erode the way it already has in fourteen places.
20. As a developer, I want the existing token names kept, so that no component has to be rewritten to adopt the new system.
21. As a Full-timer, I want the redesign to be revertable, so that if the team dislikes it we can go back without unpicking feature work.

## Implementation Decisions

**Everything lands in the stylesheet.** The `@theme` block and the `:root` and `.dark` blocks in the application stylesheet carry the entire change. Component markup is not modified. The Material-compatibility aliases (`--surface`, `--on-surface`, `--outline`, and the rest) are kept exactly as they are, so every existing utility class retints automatically.

**Surfaces invert.** `--bg` becomes white and `--panel` becomes the light grey. `--panel-2` becomes the deeper tint used for nested surfaces and segmented-control tracks. This is the whole of the structural change.

**Borders recede but are not removed.** `--border` and `--border-soft` move to near-invisible neutrals. They survive because inputs, secondary buttons and list dividers genuinely need an edge; cards no longer rely on them.

**Black replaces violet as the accent.** `--accent`, `--accent-strong` and `--accent-hover` become near-blacks. `--accent-soft` and `--accent-line` become low-alpha blacks.

**Selection becomes inversion, and this needs auditing.** Filter chips already fill with `--accent` rather than tinting, so they invert for free. The states that tint with `--accent-soft` do not: at six per cent black that fill is effectively invisible. Every `--accent-soft` selection state must be found and moved to a solid fill with inverted content. This is the one place where the token swap forces markup changes.

**`--accent-on` becomes theme-dependent for the first time.** In light, the primary button is black with white content; in dark it is white with black content. Bento could keep `--accent-on` as white in both blocks because violet was the fill either way. Anything that hardcodes white on top of `bg-primary` instead of using `text-on-primary` breaks in dark mode, and the existing hardcoded hex values are the likely offenders.

**Signal colours are deliberately not changed.** Success, warning and danger — and their container variants — carry meaning and already have good contrast. They are carried over from Bento unchanged. A monochrome interface makes them *more* legible, not less.

**Data hues gain chroma.** The `--tone-c` and `--tone-l` values driving the stage and board hues increase, because these become the only saturated colour on screen. The eight hue angles are unchanged. The legacy `--color-board-*` names are kept: board stage colours are persisted in Firestore as class-name strings, and retiring them would require a data migration that is not part of this work.

**Shape gains two steps.** The small radius moves up slightly, the interactive radius moves down slightly, the container radius is unchanged, and two new tokens are added: an extra-large radius for shell-level containers and a pill radius for buttons, chips and avatars.

**Typography adds a display face.** The heading alias `--font-serif`, which today simply points at `--font-sans`, is pointed at a display face carrying 700 and 800 weights; body copy stays on Lexend. Lexend was plausibly chosen for reading proficiency and that choice is respected. The font stylesheet link is updated to load both families with fallback stacks chosen for close metrics. Because headings already read the `--font-serif` alias, this is a one-line change rather than a sweep.

**Elevation stays flat.** Card shadow remains none. The popover shadow is deepened and softened. A shell-level shadow token is added for raised chrome.

## Testing Decisions

**A good test here asserts behaviour a user could observe, not a value we wrote down.** A test that asserts `--bg` equals a particular hex tests the implementation: it fails whenever the design changes, catches no defect, and makes the design system harder to edit rather than safer. Per the repository's testing policy, pure styling changes are tested only where behaviour is actually assertable, and hollow snapshot tests written to satisfy a coverage rule are explicitly not wanted. No unit tests are added for token values.

**The token-discipline guard is the one thing worth automating.** A script is added mirroring the existing i18n regression guard, which scans only the lines added in the current diff rather than the whole repository. The same model applies: the existing 14 hardcoded hex values and 109 raw Tailwind palette classes are not flagged, but no new ones can be introduced without a token. The i18n guard is the direct prior art for both the diff-scoping approach and the CI wiring.

**Existing tests must keep passing untouched.** Every component test in the suite renders markup that is not being modified. If any of them fail, the change has reached further than intended and that is itself the signal. No test file should need editing to accommodate this work; a test that needs editing indicates a hardcoded colour that should have become a token.

**Dark mode is verified by exercise, not by assertion.** The existing provider test already covers the light/dark class toggle and needs no change. The `--accent-on` inversion is verified by walking the application in both themes, with particular attention to the fourteen hardcoded hex values and anything placing white content on a primary fill.

**Visual verification is manual and expected to be.** The E2E suite provides smoke coverage that destinations still render and that flows still complete. It is not asked to assert appearance.

## Out of Scope

- The navigation shell. The rail and the navigation preference are specified separately and are not required by, and do not require, this change.
- Migrating the persisted `board-*` stage colour class names in Firestore to the `stage-*` token names. That migration is tracked separately and would need a data backfill.
- Retiring the pre-existing 14 hardcoded hex values and 109 raw palette classes. The guard prevents new ones; cleaning up the existing ones is separate work and should not be bundled into a change whose value depends on being easy to revert.
- Any layout, spacing, density or information-architecture change. Ink re-values tokens; it does not move anything.
- The mobile application's native chrome, where it does not read from these tokens.
- Adding new components, states or variants.

## Further Notes

The design is drawn out in full on a canvas covering foundations, the component sheet with real dimensions, the Home and The Journey destinations at 1440, and the dark theme block. Sources are checked in under `docs/design/ink/`; the published canvas is at https://claude.ai/code/artifact/15037373-dc36-41fa-98df-ca1d16678d73. Values there were lifted from the existing stylesheet and component source rather than invented, so the artboards can be read as the target rather than as an impression of it.

Two things are worth knowing before starting. First, the `--accent-soft` selection audit is the only part of this work that is not a value swap, and it is the part most likely to be missed, because a nearly-invisible selection state still renders without error — it just stops communicating. Second, the domain glossary describes Global Search as "the desktop topbar search field"; if the navigation work lands afterwards, that definition needs updating, and it is worth not letting the two changes silently contradict the glossary.

The change is deliberately shaped to be revertable in a single commit. That property is worth protecting: it is what makes it reasonable to put an unfamiliar visual system in front of the team and find out whether they like it.
