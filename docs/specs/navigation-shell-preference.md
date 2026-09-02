# Navigation shell preference

## Problem Statement

The desktop navigation is a sticky top bar. Horizontal space is finite, so the bar shows a handful of destinations and folds the rest into a More menu — and `PRIMARY_BY_ROLE` promotes only three destinations per role. A Full-timer has thirteen destinations available and sees three promoted, with ten behind a menu they have to remember exists. Reaching Looking back, Answered, Gospel or Visits is two clicks, the first of which is a menu with no affordance suggesting what is inside it.

This is not a styling complaint. Destinations that are two clicks behind an unlabelled menu get used less than destinations that are visible, and the ones currently buried include most of the pastoral work the product exists to support.

## Solution

Move desktop navigation to a vertical rail, which has the room to show every destination a role can reach, grouped, with no More menu. Because the rail costs horizontal space that some people will not want to pay, and because the existing top bar is genuinely better for width-hungry views, the shell becomes a per-user preference with three states:

- **Rail** — 232px, labelled, all destinations visible and grouped. The default.
- **Compact** — 76px, icon-only, labels on hover and focus. Same destinations, less width.
- **Top bar** — the current shell, unchanged.

The preference is stored per user and is desktop-only. Below the large breakpoint every state falls through to the existing mobile bottom navigation, so the preference never has to describe a phone.

## User Stories

1. As a Full-timer, I want every destination I can reach to be visible without opening a menu, so that I stop forgetting that Looking back and Answered exist.
2. As a Trainee, I want destinations grouped by what they are for, so that I can find the right one by category rather than by scanning an alphabetical list.
3. As a Full-timer, I want to reach any destination in one click, so that moving between Coordination Notes and The Journey does not cost me a menu each time.
4. As a Student, I want the navigation to show only what my role can reach, so that I am not shown destinations I cannot open.
5. As a Community member, I want my smaller set of destinations to look deliberate rather than like a stripped-down version of someone else's navigation.
6. As a Trainee, I want the destination I am currently on to be unmistakable, so that I always know where I am.
7. As a Trainee, I want to collapse the navigation to icons, so that I can give a wide table more room without giving up one-click access.
8. As a Trainee, I want my collapsed or expanded choice remembered, so that I do not re-set it every morning.
9. As a Full-timer, I want to switch back to the top bar entirely, so that I can keep the shell I am used to if I prefer it.
10. As a Full-timer, I want to change the navigation style in Settings, so that there is one obvious place to find the option.
11. *(Retired in #681)* The rail width preference is configured in Settings; the on-rail collapse toggle was removed to keep the rail footer minimal.
12. *(Retired in #681)*
13. As a Student using the compact rail, I want to see a destination's name on hover, so that I do not have to learn thirteen icons.
14. As a keyboard user, I want destination names to appear on focus as well as hover, so that the compact rail is usable without a mouse.
15. As a screen-reader user, I want every destination to keep its accessible name when its label is hidden, so that the compact rail is not silent.
16. *(Retired in #681)*
17. As a Trainee, I want unread counts to remain visible when the rail is collapsed, so that collapsing does not hide that something needs me.
18. As a Full-timer, I want my navigation choice to survive a reload, so that it behaves like a setting rather than a session toggle.
19. As a Trainee, I want the correct shell on first paint, so that the page does not flash the wrong navigation and reflow underneath me.
20. As a Trainee on a narrow laptop, I want the rail to collapse automatically rather than crushing the content, so that a smaller window is still usable.
21. As a Trainee, I want an automatic collapse to be temporary, so that resizing a window does not permanently change the preference I chose.
22. As a Full-timer on a 13-inch laptop, I want the destination list to scroll within the rail, so that a long list does not push the pinned controls off-screen.
23. As a Full-timer, I want the Settings link to stay pinned, so that the way out of a state is never the thing that scrolls away (updated in #681).
24. As a Student on a phone, I want navigation to be unchanged, so that a desktop preference has no effect on my device.
25. As a Full-timer impersonating a colleague, I want the impersonation banner to remain prominent in every shell, so that I never forget whose account I am acting in.
26. As a Full-timer, I want Global Search reachable from the same keyboard shortcut in every shell, so that muscle memory survives the change.
27. As a Trainee, I want search, notifications and my avatar in a consistent place, so that switching shells does not mean relearning where things are.
28. As a Full-timer, I want the current season indicator to stay visible, so that I always know which season I am looking at.
29. As a developer, I want the shell resolution logic in one testable place, so that the width rules are not scattered across components.
30. As a developer, I want search and notifications mounted by the shell rather than by each navigation component, so that they are written once rather than three times.

## Implementation Decisions

**A provider owns the preference, modelled on the existing theme provider.** A navigation shell provider exposes the stored preference, the *effective* shell after width rules are applied, and a setter. It reads storage in the state initialiser rather than in an effect, exactly as the theme provider does — reading in an effect flashes the wrong shell on every load. Storage key and shape follow the theme provider's convention.

**The preference is one flat enum, not two booleans.** The values are rail, rail-collapsed, and topbar. A pair of booleans would admit "top bar, collapsed", which means nothing; a flat enum makes that unrepresentable. It also gives remembering for free: leave the rail for the top bar, come back, and you return to the width you left.

**Effective shell is derived, never stored.** The stored preference and the rendered shell are different values. Width rules produce the second from the first, and only explicit user action writes to storage.

**Width rules.** Below the large breakpoint (1024px), all three states fall through; the preference is neither consulted nor changed. Between 1024px and 1280px — the point where a 232px rail stops being affordable — the rail renders collapsed regardless of preference: a forced collapse held in component state that must not write back to storage, or a briefly narrow window permanently changes what someone chose. Above 1280px, the stored preference is honoured.

**What "falls through" means below 1024px.** Read literally, "falls through to the existing mobile navigation" would put the bottom bar on every viewport under `lg`, which gives 768–1023px both the top bar's hamburger drawer *and* a bottom bar. What it means, and what is implemented: below `lg` the rail is not rendered and the shell falls through to the **top-bar branch**, which already carries its own drawer under `lg`; the bottom bar keeps its own `md` threshold and is unchanged. Only the rail's gates move at `lg`.

**Grouping is role-filtered data and belongs with the other navigation data.** A grouping function is added alongside the existing per-role navigation helpers, returning ordered groups of destinations for a role. Groups are Today, People, Gatherings and Prayer, with Settings pinned below a divider.

**The More menu is retired for both rail states.** The rail shows everything a role can reach, so the more-navigation helper is no longer called by the rail. It remains in use by the top-bar shell, which still needs it. Its existing tests stay meaningful for that path.

**Collapsing changes five things.** Group labels become hairline dividers, so the grouping survives without the words. Items become 44×44 squares at the interactive radius rather than pills, because a pill at that width reads as a circle. Count badges become a dot — "something here" without the number. Labels move to a tooltip on hover *and* focus. The wordmark drops to the mark.

**The rail does not own an account block.** This was originally specified as a sixth collapsing behaviour — an avatar, name and role pinned at the bottom of the rail, reducing to the avatar alone. It contradicted this document's own reasoning two decisions below: search, notifications and the season indicator are mounted by the shell precisely so they are written once rather than per-shell, and the avatar is the same case. It lives in the chrome strip with them. The rail's pinned footer is the Settings link (the collapse toggle was retired in #681; rail width is controlled in Settings).

**Leaving the rail entirely or collapsing to compact rail is a Settings decision.** *(Updated in #681)* The Settings control is the canonical location for switching among Rail, Compact, and Top bar.

**The Settings control is a segmented control** offering all three states, using the existing segmented-control pattern, with copy making clear the setting is desktop-only.

**The shell mounts shared chrome.** Global Search, notifications, the season indicator and the avatar are mounted by the shell, not by the navigation component. In both rail states they sit in a strip above the content; in top-bar mode they return to the bar. This keeps them written once and keeps the keyboard shortcut identical everywhere.

**The impersonation and owner-view banners need a defined home in each shell.** In the rail states they sit at the top of the content column; in top-bar mode they stay full-bleed beneath the bar. A safety banner whose position depends on a display preference is worth specifying rather than discovering.

**The rail scrolls internally.** At its expanded height the destination list overflows a 13-inch laptop viewport. The list scrolls within the rail while the mark and the Settings link stay pinned.

## Testing Decisions

**A good test here asserts what a user experiences, not how it is arranged.** For this feature that means: given a stored preference and a viewport, which shell do I get, and did my preference survive? Tests that reach for provider internals, assert class names, or count rendered elements are testing the arrangement and will fail on every refactor without ever catching a defect.

**The provider is the primary seam and carries most of the value.** It is the single new seam in this work, and the interesting behaviour is all resolution and persistence: an absent stored value yields the default; a stored value is honoured above the breakpoints; a stored value is read before first render rather than after; narrow viewports resolve to the mobile shell; intermediate viewports resolve to collapsed while leaving storage untouched; widening again restores the stored preference; and setting a preference persists it. The existing theme provider test is direct prior art and has already solved the `localStorage` and `matchMedia` mocking this needs.

**The forced-collapse-does-not-persist case is the one to write first.** It is the defect most likely to ship, because the interface looks correct while it happens — the damage only shows up later, on a different screen, as a preference the user did not choose.

**Grouping is tested at the existing permissions seam.** The grouping function is tested the way the existing per-role navigation helpers are: for each role, that the returned groups contain exactly the destinations that role can reach, that no destination appears twice or goes missing, and that ordering is stable. The existing permissions test file is both the prior art and the home for these.

**Retiring the More menu for the rail touches existing tests.** The more-navigation helper keeps its tests for the top-bar path. The top-bar test file should be checked for assumptions that the top bar is the only shell.

**Component tests are not the seam.** The rail and top bar render from the provider and the grouping function. One integration test per shell — that the expected destinations appear and the current one is marked — is enough. Everything else belongs to the two seams above.

**Accessibility behaviour is assertable and should be asserted.** That collapsed destinations keep an accessible name, that the collapse control exposes its expanded state, and that tooltips appear on focus are all user-observable behaviours and belong in tests rather than in a review checklist.

## Out of Scope

- The Ink design system. Specified separately; the rail works in either palette and neither change requires the other.
- Any change to mobile navigation. Below the large breakpoint the existing bottom navigation is used unmodified.
- Changing which destinations exist, what they are called, or which roles can reach them. Only their presentation and grouping change.
- Making group membership user-configurable. Groups are fixed.
- Reordering destinations within a group by drag, or pinning favourites.
- Syncing the preference across devices. It is device-local, like the theme.
- Retiring the more-navigation helper, which the top-bar shell still needs.
- Changing Global Search behaviour or its keyboard shortcut.

## Further Notes

The three states, both rail widths at full size, the grouping, the Settings control and the width rules are drawn out on a canvas artboard, together with a side-by-side of the top bar and rail on the same destination with identical content. Sources are checked in under `docs/design/ink/` (`NavPref.dc.html` and `Shells.dc.html`); the published canvas is at https://claude.ai/code/artifact/15037373-dc36-41fa-98df-ca1d16678d73.

Two findings from drawing it are worth carrying into implementation. The expanded rail is taller than a 13-inch laptop viewport once a Full-timer's thirteen destinations, four group labels and the pinned footer are counted — internal scrolling is a requirement, not a refinement. And the intermediate-width forced collapse is the sharp edge: it must be component state, never a write.

This is three navigation states to keep in sync for as long as the product lives. Every destination added later needs a group, an icon that survives at 20px with no label beside it, and a check in all three. That cost was raised and accepted deliberately; it is recorded here so that whoever picks this up knows it was a choice rather than an accident.

The domain glossary currently defines Global Search as "the desktop topbar search field". That definition stops being accurate when this ships and should be updated as part of the work.
