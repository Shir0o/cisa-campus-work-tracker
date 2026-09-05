# 0010: Reactive in-situ first-run checklists over overlay walkthroughs

## Status
Accepted

## Context
Issue [#845](https://github.com/Shir0o/cisa-campus-work-tracker/issues/845) asked for better onboarding for new users joining campus teams. The existing first-run experience is the `FirstRunCard` (issue #335): a role-aware checklist rendered directly on the home screen (`MyDay`, role landings) whose ticks are reactively derived from live records — contacts added, conversations logged, prayers offered — not manually ticked.

Two onboarding approaches were considered:

1. **Overlay/spotlight tours** — darkened screens with multi-step popovers pointing at UI regions.
2. **Deepening the existing reactive checklist** — a visual progress meter ("X of Y complete") on `FirstRunCard`, and a Settings affordance (`FirstRunStore.bringBack`) to restore the checklist after dismissal.

Overlay tours were rejected: they break across layout updates (every layout change shifts the anchor coordinates they point at), they conflict with the app's reactive philosophy (they describe a frozen UI state rather than reflecting live data), and they add a modal layer that must be maintained on both web and mobile shells.

## Decision

1. **Onboarding guidance stays in-situ.** The first-run checklist remains a plain card on the home screen. Progress is communicated by an accessible meter (`role="progressbar"` with `aria-valuemin`/`aria-valuemax`/`aria-valuenow`) and a "X of Y complete" indicator, both derived from the same reactive step evaluation as the ticks.

2. **No overlay or spotlight tours.** Multi-step popover walkthroughs that darken the screen are explicitly out of scope, permanently, for the reasons above.

3. **Dismissal is revisitable, not permanent.** `FirstRunStore.bringBack(key)` (localStorage, key `fr:<role>:<uid>`) is exposed in Settings ("Getting started" section) so a user who put the card away can restore it. The card still disappears quietly on its own once every step completes.

## Consequences
- Onboarding progress is always truthful: it is computed from live app data, so no extra "mark as done" interaction exists to lie or drift.
- Adding new first-run steps requires no tour choreography — the checklist and meter update reactively.
- Layout changes cannot break onboarding, because nothing anchors to screen coordinates.
