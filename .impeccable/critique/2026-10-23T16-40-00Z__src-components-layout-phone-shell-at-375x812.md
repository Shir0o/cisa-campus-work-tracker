---
target: src/components/layout (phone shell at 375x812)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1775/src/components/layout (phone shell at 375x812)"
timestamp: 2026-10-23T16-40-00Z
slug: src-components-layout-phone-shell-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; Assessment A ran before the detector, Assessment B ran after)

# Critique: `src/components/layout` — the phone shell at 375×812

Target: the shared nav and notification chrome every page mounts — `MobileNav.tsx` (bottom bar), `TopNav.tsx` (header strip, hamburger, drawer, More menu), `NotificationCenter.tsx` (bell + sheet). Live app on the seeded emulator, signed in as the Trainee (`trainee.e2e@example.com`), not a mock.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The selected bottom-bar destination differed from the others by a 6% wash — 1.09:1 against the bar — and both labels resolved to the same `#52525B`. The sheet's subtitle, group labels and every timestamp were `#E4E4E7` on `#EAEAEC` (1.1:1). |
| 2 | Match System / Real World | 3 | Domain vocabulary is right ("What's stirring", "On our hearts"), but the panel's copy was hardcoded English inside a bilingual app, and the bar called two destinations by names no other surface uses. |
| 3 | User Control and Freedom | 2 | Escape closes both layers, but "Set aside" and "Set stack aside" were `opacity-0` until hover — a phone could not clear a notification at all. Opening the sheet left focus on the bell and never returned it. |
| 4 | Consistency and Standards | 1 | Three nav surfaces, two selection languages: the drawer and the desktop tabs invert to solid ink (DESIGN.md's Inversion Rule), the bottom bar tinted. Header controls measured 36–38px against the repo's documented 44px phone minimum (DRIFT #45). |
| 5 | Error Prevention | 2 | The always-reachable destructive control sat 22×22 with a 7px unread dot underneath it; the centred search FAB floats 20px over the list it belongs to, so a reach for the last row can land on search. |
| 6 | Recognition Rather Than Recall | 2 | For a Trainee the bar holds Home and People; Messages, Questions, Prayer and everything else live behind the hamburger. The waiting-asks badge that exists on the rail and top bar has no mobile equivalent. |
| 7 | Flexibility and Efficiency | 2 | No re-tap-the-active-destination gesture; no way to see queued questions without opening the drawer. |
| 8 | Aesthetic and Minimalist Design | 2 | The shell is quiet and on-system, but the near-invisible selection and the 1.1:1 metadata read as unfinished rather than restrained. |
| 9 | Error Recovery | 2 | Mark-as-read and set-aside failures are swallowed into `console.error`; nothing tells the reader the tap did not land. |
| 10 | Help and Documentation | 3 | Landmarks, `aria-expanded` and the collapsed-rail tooltips are genuinely good; two landmark labels stay English under `es`. |
| **Total** | | **21/40** | **Acceptable (52.5%)** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic mobile shell. The vocabulary is the product's ("What's stirring", "Nothing needs you right now", "On our hearts"), the empty state reads like the team talks, and the header carries exactly what a trainee needs on a walk across campus: search, the bell, and their own face. Where it drifts is in *state*, not in voice: the bottom bar was the one surface that abandoned Ink's inversion for a faint SaaS-chrome tint, and its labels forked from the drawer's. A product this specific about naming people and places cannot afford two names for the same destination, or no visible answer to "where am I".

**Deterministic scan.** `impeccable detect` over `src/components/layout` returned **21 findings, all advisory**: 20 "font size outside DESIGN.md" (mostly pre-existing 10px/11.5px/13.5px micro-copy across TopNav, PageTrail, NotificationCenter, NavRail, GlobalSearch, SeasonChip) and 1 `side-tab` in NotificationCenter (the accent left border on an expanded stack). None of these are new to this pass and none were fixed here.

**Browser overlays.** Detector injected into the live app at 375×812. `/directory`: 5 anti-patterns — placeholder 3.6:1, a 3.8:1 link chip, 3.4:1 and 3.2:1 secondary chips, and one `text-occlusion` hit that is a false positive (it found its own badge). The notification sheet: 7 anti-patterns — **4 × 1.1:1 `#E4E4E7` on `#EAEAEC`** (subtitle, group label, two timestamps) and 2 × 3.4:1. The 1.1:1 cluster is the P0 below, and the detector only sees it with the sheet open — which is why every one of these shipped.

## Overall Impression

A calm, well-labelled shell that fails at the two moments a phone user needs it most: knowing which destination is lit, and reading the metadata in the notification sheet. Both failures are token misuse rather than taste — `--secondary-container` where inversion was specified, `--outline` (a border colour) where reading ink was meant.

## What's Working

1. **The drawer is the strongest surface in the app.** Solid-ink inversion on the current destination, 44px rows, grouped destinations, language and log out pinned to the bottom. It is the reference the bar should have matched.
2. **The empty state has a voice.** "Nothing needs you right now / A quiet inbox is a kind of grace" is a content decision, not filler, and it survived the fixes intact.
3. **The rail's badge accessibility.** Count in the accessible name, dot `aria-hidden`, tooltips on keyboard focus — the pattern is right and was carried into the panel's popover semantics.

## Priority Issues

### [P0] Notification sheet's secondary copy is invisible (1.1:1)
- **What**: Subtitle, group labels ("Worth a look", "Earlier"), timestamps and the empty-state body used `text-outline`, which resolves to `--outline` — `#E4E4E7`, the *border* token — on a `#EAEAEC` panel. Measured 1.1:1; WCAG needs 4.5:1.
- **Why it matters**: The reader cannot see when a notification arrived or which group it is in. A notification sheet whose times are unreadable is a list of claims without provenance.
- **Fix**: Secondary copy moves to `--on-surface-variant` (`#52525B`, 6.6:1 on the panel). Retire `text-outline` as a text colour in this file.
- **Suggested command**: `/impeccable colorize src/components/layout/NotificationCenter.tsx`

### [P1] The selected bottom-bar destination is indistinguishable
- **What**: Active used `bg-secondary-container` (a 6% ink wash) with `text-accent`; inactive used `text-on-surface-variant`. Both tokens resolve to `#52525B`, so only a 1.09:1 wash separated them — against DESIGN.md's Inversion Rule ("never as a faint 6% tint") and WCAG 1.4.11's 3:1 non-text minimum.
- **Why it matters**: Outdoors, at a glance, in a hurry, nobody can tell whether they are on Home or People. The drawer and the desktop tabs already answer this correctly; the bar answered differently.
- **Fix**: Solid ink disc, glyph inverted to `--on-primary`, label to `--on-surface` at semibold. Selection is now computed from `sectionHrefFor`, so `/people/:id` keeps People lit instead of nothing.
- **Suggested command**: `/impeccable bolder src/components/layout/MobileNav.tsx`

### [P1] Header controls are 36–38px, not 44px
- **What**: Hamburger 36×36, search 36×36, bell 38×38, avatar 36×36, drawer close 36×36, "Mark all read" 96×27, set-aside 22×22. The repo's own phone rule is 44px (DRIFT #45).
- **Why it matters**: One-handed use on a moving campus walk. The bell and the hamburger sit 40px apart, so a mis-tap opens the drawer instead of the tray.
- **Fix**: Every header control is now 44×44; the sheet's "Mark all read" is 44 tall; set-aside is a 36px control with a 44px pseudo hit area, always visible on phones.
- **Suggested command**: `/impeccable adapt src/components/layout`

### [P1] Clearing a notification was hover-only
- **What**: `opacity-0 group-hover:opacity-100` on both set-aside buttons. There is no hover on a phone.
- **Why it matters**: The one way to clear the tray is unreachable on the device the PWA is for; the only remaining exit is "Mark all read", which is a different intent.
- **Fix**: Visible at rest below `sm`, hover-revealed above it (where the pointer exists). On phones the per-row unread dot is suppressed because the control occupies that corner; the sheet already partitions unread from read.
- **Suggested command**: `/impeccable harden src/components/layout/NotificationCenter.tsx`

### [P1] The bottom bar ignores the home indicator
- **What**: `pb-safe` is not a utility this project defines, and nothing else supplies `env(safe-area-inset-bottom)`. Computed padding was `0px`.
- **Why it matters**: On any notched iPhone in standalone PWA mode the labels sit under the home indicator.
- **Fix**: `pb-[env(safe-area-inset-bottom)]` with `min-h-16`, so the bar grows into the inset instead of squeezing its labels.
- **Suggested command**: `/impeccable adapt src/components/layout/MobileNav.tsx`

### [P2] The drawer's scrim was transparent
- **What**: `bg-scrim/50` names a colour token the theme never defines, so it computed to `rgba(0,0,0,0)`: the drawer opened over an undimmed, still-legible page.
- **Fix**: `bg-on-surface/40`. The page now recedes and the drawer reads as a layer above it.
- **Suggested command**: `/impeccable polish src/components/layout/TopNav.tsx`

### [P2] The sheet's copy and landmarks were hardcoded English
- **What**: "What's stirring", "Mark all read", "You're all caught up", "Nothing needs you right now", the grace line, the singular/plural count, and the `aria-label`s "Mobile Navigation" and "Search" were literals. In Spanish the tray mixed languages and a screen reader announced an English landmark.
- **Fix**: Keys added to `en.json` and `es.json` (including a real singular, "1 thing since you last looked"), and the bar's landmark is localized.
- **Suggested command**: `/impeccable clarify src/components/layout/NotificationCenter.tsx`

### [P2] Two names for the same destination
- **What**: The bar said "Contacts" and "Prayer" for destinations the drawer, rail and top bar call "People" and "On our hearts"; it said "Home" for a full-timer's "My Day".
- **Fix**: The bar reads the same vocabulary, including the 22px "My Day" swap for admins.
- **Suggested command**: `/impeccable clarify src/components/layout/MobileNav.tsx`

## Persona Red Flags

- **Casey (distracted mobile user, one hand, walking)**: cannot tell which destination is lit under campus sun; reaches for the row's "×" and finds nothing because it only exists on hover; the bar's labels sit under the home indicator on a notched phone; Messages, Questions and Prayer are all two taps away behind the hamburger while 60% of the bar is empty space around the FAB.
- **Sam (screen reader / low vision)**: subtitle and timestamps at 1.1:1 are invisible; opening the sheet leaves focus on the bell, so VoiceOver's next swipe walks the page behind the panel rather than the sheet; "Mobile Navigation" is announced in English while the rest of the shell is Spanish; the per-row dismissal is a nested `<button>` inside a `div[role=button]`, which flattens confusingly in the rotor.
- **Zion (Trainee, the seeded account)**: gets "Home · search · People". Wants Messages and the questions waiting on an answer — both exist, both cost a drawer open and a destination tap, and neither shows a badge on the device he actually carries.

## Minor Observations

- `NotificationCenter`'s sheet is a `role="dialog"` with no scrim and no modal semantics at phone width: it reads as a floating strip over live content. Now focus-managed, still not modal.
- Notification rows are `div[role="button"]` with `tabIndex=0`, handling `Enter` only (the stack header handles `Enter` and `Space`), and they contain real buttons.
- Mark-as-read and set-aside failures are logged, never surfaced; a stale row silently reappears on the next snapshot.
- The centred search FAB floats 20px above the bar and overlaps the last list row on every page; `main` compensates with 144px of bottom padding, which is a lot of dead space at 812px tall.
- `aria-label` for the bell pluralizes as "{n} new notifications" for n = 1.
- Two floating round buttons (search, feedback) sit in the thumb zone within 40px of each other on People.

## Questions to Consider

- **Is a two-destination bar the right shape for a Trainee?** The bar has room for four and uses two. If Messages and Questions were destinations, the drawer would become the overflow it is named for rather than the only way to reach half the app.
- **Should the notification sheet be a sheet?** At 375 it is a 336px strip that covers the page title and leaves the page live behind it. A bottom sheet with a scrim would match the drawer's clarity and put the dismiss controls under the thumb.
- **What is `--outline` for?** It is a border colour doing text duty across this file. Is there a lint rule that could make that impossible rather than catching it in a critique?

---

**Fixed in this pass**: the P0, all four P1s, and the two cheap P2s (scrim token, destinations' names, menu copy and landmarks localized).
**Filed as follow-up**: the bar's information architecture (Messages/Questions and the waiting-asks badge), re-tap-to-scroll-top, notification-row semantics, and the mobile sheet's modal treatment.
