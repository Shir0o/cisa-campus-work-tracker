# The chrome strip's blank half — design canvas sources

Source artboards for [issue #803](https://github.com/Shir0o/cisa-campus-work-tracker/issues/803):
the empty 773&#215;56 band to the left of the search bar in the rail shell.

Published canvas: https://claude.ai/code/artifact/e47c7474-ed79-4a88-8918-70e26bbf178b

## What was measured

At the reporter's viewport (1491&#215;806, full-timer, rail expanded at 232px) the
content column is 1211px wide. `NavChromeStrip`'s cluster — GlobalSearch 300,
Bell 38, Eye 36, Avatar 40, `gap-2` between — takes 438px off the right. The
`flex-1` spacer holding it there leaves **773 &#215; 56 px** with nothing in it, on
every page in rail mode.

The reporter's guess is correct. The strip is `TopNav`'s chrome hoisted into the
rail shell ([ADR 0003](../adr/0003-nav-rail-floating-shell.md), DRIFT #8); the
row was the top bar's, and the top bar is gone.

**A second finding fell out of drawing it.** On `/people/:contactId` no rail
destination is selected: `RailItem`'s `isActive` tests `currentPath === item.href
|| currentPath.startsWith(item.href + '/')`, and the contact route is neither
`/directory` nor a child of it. On a contact page nothing in the shell says
where you are — not the rail, not the strip.

## The artboards

| File | What it covers |
| --- | --- |
| `Today.dc.html` | What renders now, at 1:1, with the band and the unselected rail redlined. |
| `Main.dc.html` | **Direction A — the trail**, in the rail shell. `‹ People / David Alvarado` at 13px in the band's left. Chosen. |
| `TopBar.dc.html` | A's second mount point — the top-bar shell, where `NavChromeStrip` does not exist. |
| `Actions.dc.html` | **Direction B — the page's own header row.** Name, stage and actions move up out of the card; the card's first row becomes the tab bar. |
| `Reclaim.dc.html` | **Direction C — reclaim the row.** No reserved band; the chrome floats on its own pill and every page owes the shell a clear top-right corner. |
| `WideSearch.dc.html` | **Direction D — let search take the space.** `w-[300px]` → `flex-1`. One class. |
| `Spine.dc.html` | Direction A across every route shape it has to survive — root, section, record, and the settings route reachable only from the avatar menu — plus dark. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

## The two shells

`NavChromeStrip` only exists in the rail shell, so the trail needs a second
mount point or it vanishes for anyone whose preference is `topbar`. It cannot
join `TopNav`'s row — brand, three primary tabs, More and the chrome already
spend ~1150 of 1451px at this width — so it gets a 40px row of its own inside
the sticky header block, above its single bottom rule. One component, one
route→label map, two mounts.

The rule that keeps them honest:

| Shell | Trail |
| --- | --- |
| Rail (`rail` / `rail-collapsed`, ≥1024px) | **Always.** The band exists whether or not it is filled, and the rail cannot name a record. |
| Top bar (≥1024px) | **Only on a route with a leaf.** The active primary tab already names a top-level place; 40px is 5% of the viewport. |
| Below 1024px | **Never.** Every preference falls through to the top bar there, and the page's own mobile header already carries `‹ People`. |

It aligns to its own container's gutter, not to a fixed number — `lg:px-5` in the
header, the content column's 24px in the rail shell. There is no single page
gutter to align to: `.cd-page` pads 24 and `PageContainer` pads 32.

`TopBar.dc.html` also records a third finding. In the top-bar shell the answer to
"where am I" on a contact page is not merely missing, it is wrong: **More**
renders in its active state on any path outside the primary three, and its glyph
is `NavGlyph href={pathname}`, which falls through to the dashboard icon for
`/people/:contactId`.

## Why A

It is the only direction that adds something the app does not have, rather than
rearranging what it does: the section a record belongs to, and a way back to it.
Desktop has no back control on a contact page today — only the `×` at the card's
far right, 96px from the eye. Mobile has had `‹ People` since the start.

It is also the cheapest of the three that carry content. B makes thirteen
destinations each owe the shell a title and an action set. C makes them each owe
it a 468&#215;52 keep-out zone, and costs the contact card its call / text / mail
buttons. D changes one class but makes the emptiest control on the page the
largest one.

The trail reads from a route→label map that `permissions.ts` already holds as
`NAV_ITEMS`. `/people/:contactId` needs one row added pointing at `/directory` —
which is the same missing link that leaves the rail unselected, so one map fixes
both findings.

**A's honest cost**: the leaf repeats the name the card header carries 40px
lower. It is set at 13px against the card's 17px serif so it reads as a trail and
not a second title, but it is a repetition, and B is the direction that removes
it.

## What the drawings assume about the code

- Light theme, full-timer role, owner (the eye button is owner-only). The rail
  boards assume preference `rail` at ≥1280px, so the rail is 232px rather than
  76px; `TopBar.dc.html` assumes preference `topbar` at the same width.
- The rail's destination list is taller than 774px and clips at the frame
  bottom. That is what renders; it is not a drawing error.
- Overview is drawn at low fidelity. The subject is the 56px above it.

## Noticed while drawing, not fixed here

`TopNav`'s brand tile is `rounded-xl` on a 36×36 box. `--radius-xl` is 32px, so
it clamps to 18 and renders as a circle — exactly the defect DRIFT #4 fixed on
the rail's tile and did not fix here. Drawn as it renders; worth its own line in
the register.

## Before this ships

Walk it in **both themes** in the running app. DRIFT #9 is on this list because
a defect that no amount of reading the source would have found was sitting in
dark mode for months. `Spine.dc.html` draws the dark specimen; that is a
drawing, not a walk.
