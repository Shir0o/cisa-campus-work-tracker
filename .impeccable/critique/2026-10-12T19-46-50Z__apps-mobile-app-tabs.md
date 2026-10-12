---
target: apps/mobile/app/(tabs)
total_score: 21
max_score: 36
na_heuristics: 9
p0_count: 1
p1_count: 2
target_identity: "file:/Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/critique_mobile_tabs_ui/apps/mobile/app/(tabs)"
timestamp: 2026-10-12T19-46-50Z
slug: apps-mobile-app-tabs
---
# Critique: apps/mobile/app/(tabs)

Method: dual-agent (A: 7c20631b-2fe9-4b1b-8772-20723801d50e · B: cf458961-a6a3-4b34-9d6c-3e99ce5519bd)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Active tab pill has 1.10:1 contrast ratio against `#F6F8FB` in light mode (invisible under campus sunlight). Unread indicator is an uncounted 6px dot with no urgency/scale. Re-tapping active tab provides no feedback (does not scroll to top). |
| 2 | Match System / Real World | 2 | Role-tailored terminology broken in code: Students see "More" instead of "You"; Community members see "Today" instead of "What's on". Text-only tabs clash with standard mobile mental models (iOS HIG & Android M3 rely on icon + label). |
| 3 | User Control and Freedom | 3 | Deeply nested navigation from the Trainee drawer lacks an instant one-tap return to the queue. No re-tap scroll-to-top interaction on active tabs. |
| 4 | Consistency and Standards | 1 | Severe violations of both internal and platform standards: violates DESIGN.md Inversion Rule; violates Android M3 48dp touch target minimum (`minHeight: 46`); arbitrary 13px radius ignores design token scale; lacks native haptics. |
| 5 | Error Prevention | 3 | Touch target height of 46dp without `hitSlop` on 4-column compact mobile layouts increases probability of mis-taps while walking. |
| 6 | Recognition Rather Than Recall | 2 | Forcing users to read 12px text labels without recognizable iconography forces cognitive decoding rather than instantaneous visual recognition. Trainees must recall that all secondary features are in the drawer. |
| 7 | Flexibility and Efficiency | 2 | No quick-switch gestures. Trainees cannot quickly check incoming pastoral messages without abandoning their active queue state via a 3-tap modal drawer flow. |
| 8 | Aesthetic and Minimalist Design | 3 | Minimalist intent ("words, not invented icons") is undermined by arbitrary padding/radii and low-contrast decorative violet tints that clash with the crisp "Field Notebook" paper aesthetic. |
| 9 | Error Recovery | n/a | Navigation bar itself does not execute data mutations or render form errors; error handling is handled on destination screens. |
| 10 | Help and Documentation | 3 | Tab bar lacks `accessibilityHint` attributes; screen reader announcements hardcode English strings (`"2 unread"`) on Spanish locale, blocking bilingual accessibility. |
| **Total** | | **21/36** | **Acceptable (58.3%)** |

## Design Specificity Verdict

**LLM Assessment (Unanchored)**: While the conceptual architecture cleanly differentiates roles according to collegiate ministry workflows (`PRODUCT.md`), the concrete implementation of the mobile tab bar (`apps/mobile/app/(tabs)/_layout.tsx`) drifts into generic SaaS tropes and violates core design invariants:
1. **Violation of the Inversion Rule & Reserved Chroma**: `DESIGN.md` explicitly mandates: *"Selection and activation are expressed as solid ink inversion (solid black background with white text), never as a faint 6% tint... The chrome, navigation, cards, and buttons remain strictly monochrome."* Instead, `_layout.tsx` renders active tabs with an 8% faint violet wash pill (`rgba(92, 23, 229, 0.08)` / `#5C17E5`), creating the exact generic SaaS aesthetic the Ink design system forbids.
2. **Broken Domain-Specific Labeling**: For Students, the personal anchor tab intended as **"You"** (their care team, notes, invite tools) is erroneously rendered as **"More"** (an administrative overflow cliché). For Community members, the event-centric **"What's on"** is rendered as **"Today"**.
3. **Ideological "Words-Only" Chrome**: The bar foregoes standard platform glyphs in favor of raw text in a segmented-pill track, reading like a web sub-filter rather than an ergonomic native navigation bar built for on-campus mobile fieldwork.

**Deterministic Scan**: Primary target `apps/mobile/app/(tabs)` returned 0 findings (clean on AST/syntax tokens). The detector verified that semantic tokens (`c.card.*`, `c.room.*`) are imported and used cleanly without unstyled tags. However, the automated detector could not detect that the declared mobile primary token (`#5c17e5`) itself conflicts with root `DESIGN.md`'s strict monochrome chrome rules, nor that the 8% opacity tint produces a 1.10:1 WCAG contrast failure under light mode.

**Visual Overlays**: Skipped. The target is a native React Native Expo application (`apps/mobile`), not a browser DOM target, and no Metro dev server or mobile simulator is currently booted.

## Overall Impression

The role-differentiated navigation model is structurally sound and tailored to collegiate ministry fieldwork, but the visual execution of the tab bar suffers from low glanceability, outdoor contrast failures, broken student terminology ("More" instead of "You"), and an 8% violet tint that violates the core brand commitment to solid monochrome ink.

## What's Working

1. **Role-Differentiated Information Architecture**: The domain decision to customize the root shell by role (Trainee = full-screen queue; Student = personal member hub; Full-timer = ministry dashboard) directly aligns with campus ministry realities and avoids bloating frontline workers with administrative clutter.
2. **Clean Route Architecture & Deep-Link Resiliency**: Using `slot()` with `href: null` in `(tabs)/_layout.tsx` cleanly decouples visible tabs from navigable routes. Hidden routes (`people`, `journey`, `prayer`, `more`) remain fully routable via push navigation and deep links without duplicate router branches.
3. **Low-Stress Unread Philosophy**: Using an unread dot instead of high-stress red notification count badges on the bottom bar respects the product's core principle of *"relational care over bureaucratic tracking"*, minimizing gamified notification anxiety.

## Priority Issues

### [P0] Broken Tab Labels for Students & Community ("More" instead of "You", "Today" instead of "What's on") & Missing Translation Keys
- **What**: In `apps/mobile/app/(tabs)/_layout.tsx`, `mobileTitle('more')` hardcodes `t('mobile.nav.more')` ("More"), completely overriding `tabsForRole(role)` which specifies "You" for students/community. Similarly, `index` hardcodes `mobileTitle('index')` ("Today"), ignoring Community's "What's on". Furthermore, `en.json` and `es.json` lack `mobile.nav.you` and `mobile.nav.whats_on`.
- **Why it matters**: Violates product requirements and core UX: students miss their personal hub because it is disguised as an administrative "More" tab, and Spanish users see "Más".
- **Fix**: Update `_layout.tsx` to read the route's title from `tabsForRole` and translate dynamically using role-specific keys (`mobile.nav.you`, `mobile.nav.whats_on`). Add the missing keys to `en.json` and `es.json`.
- **Suggested command**: `/impeccable clarify apps/mobile/app/(tabs)`

### [P1] Invisible Active Tab Pill & WCAG Contrast Failures Under Bright Sunlight
- **What**: Active pill uses `c.card.reactOnBg` (`rgba(92, 23, 229, 0.08)`), producing an abysmal **1.10:1** contrast ratio against the `#F6F8FB` tab bar background. Inactive text ink (`#728197`) has **3.72:1** contrast (failing WCAG AA 4.5:1 for 12px text). Dark mode active text (`#9A8FFF` on dark pill) has **4.33:1** contrast.
- **Why it matters**: Directly breaches `DESIGN.md`'s Inversion Rule (*"Selection and activation are expressed as solid ink inversion... never as a faint 6% tint"*) and `PRODUCT.md`'s WCAG AA mandate. In bright campus sunlight, the active tab indicator is completely invisible.
- **Fix**: Replace the low-alpha wash with high-contrast active styling (e.g., solid `#131316` pill with `#FFFFFF` text in light mode, or high-contrast fill compliant with the Inversion Rule). Darken inactive text ink to meet at least 4.5:1.
- **Suggested command**: `/impeccable bolder apps/mobile/app/(tabs)`

### [P1] Non-Compliant Touch Target Heights (46dp < 48dp on Android)
- **What**: `styles.tab` sets `minHeight: 46` and lacks `hitSlop`.
- **Why it matters**: Violates Android Material 3 minimum touch target guidelines (48×48 dp) and `PRODUCT.md` line 81 (*"touch target minimums: 44×44 pt on iOS, 48×48 dp on Android"*). Results in missed taps for mobile workers on campus.
- **Fix**: Set `minHeight: Platform.OS === 'android' ? 48 : 46` (or uniform 48dp), and add `hitSlop={4}` to the `Pressable`.
- **Suggested command**: `/impeccable adapt apps/mobile/app/(tabs)`

### [P2] Hardcoded English in Screen Reader Accessibility Labels
- **What**: Line 87 of `_layout.tsx` hardcodes: `accessibilityLabel={unread ? `${label}, ${badge} unread` : label}`. Container also lacks `accessibilityRole="tablist"`.
- **Why it matters**: In Spanish locale, screen readers announce `"Mensajes, 2 unread"` instead of `"Mensajes, 2 sin leer"`, violating bilingual commitments (ADR 0035, `PRODUCT.md`).
- **Fix**: Use `t('mobile.tabs.unread_badge', { label, count: badge })` or localized string `${label}, ${badge} ${t('common.unread')}`. Add `accessibilityRole="tablist"` to the parent container.
- **Suggested command**: `/impeccable harden apps/mobile/app/(tabs)`

### [P2] Lack of Re-Tap Scroll-to-Top Interaction and Native Haptics
- **What**: Pressing the currently active tab executes nothing (`if (!focused && !event.defaultPrevented) navigation.navigate(...)`). Pressing tabs emits no tactile haptic feedback.
- **Why it matters**: Platform ergonomics on iOS and Android expect re-tapping the active tab to scroll lists to top. Haptics provide crucial confirmation in high-distraction campus environments.
- **Fix**: Add a check on `tabPress`: if already `focused`, emit a scroll-to-top event; trigger `Haptics.selectionAsync()` on tab switch.
- **Suggested command**: `/impeccable polish apps/mobile/app/(tabs)`

## Persona Red Flags

- **Alex (Full-timer / Trainee Field Worker)**:
  - *Outdoor Glare*: Walking across campus in midday California sun, Alex literally cannot tell whether "Today" or "People" is selected due to the 1.10:1 pill contrast.
  - *Trainee Drawer Context Switch*: As a Trainee, Alex receives an urgent student message while in the Queue. Alex has to stop walking, tap the hamburger icon, wait for the drawer to slide out, tap "Messages", read the thread, and tap `← Back` to return. The zero-tab-bar paradigm turns common team communication into a jarring 3-step context switch.
- **Jordan (First-timer Student)**:
  - *Lost Personal Hub*: Jordan is looking for their campus leader's contact or their notes from Bible study. Jordan sees "Today", "Prayer", "Messages", "More". Jordan assumes "More" is app settings/version info and never discovers their own profile or team contacts.
  - *Language Inconsistency*: When Jordan switches to Spanish, the fourth tab reads "Más", and TalkBack announces `"Mensajes, 1 unread"`.
- **Sam (A11y Dependent / Low Vision User)**:
  - *WCAG AA Failure*: Inactive tabs with `#728197` on `#F6F8FB` (3.72:1 contrast) blend into the background for Sam's low vision.
  - *Dynamic Type Truncation*: With larger text enabled in OS settings, `numberOfLines={1}` in a 4-tab flex row truncates strings with no wrap fallback.
  - *Missing Rotor Support*: Tab bar container lacks `accessibilityRole="tablist"`, degrading standard tab rotor navigation on iOS.

## Minor Observations

- `borderRadius: 13` (`styles.tab`) is a magic number that ignores the design system's token scale (14px interactive / pill).
- The 6px unread dot uses `alignSelf: 'flex-start', marginTop: 11`. When text size scales with Dynamic Type, the dot drifts away from the text baseline.
- `V2Screen` in sub-views uses a hardcoded English string `← Back` rather than a localized string or native chevron glyph.

## Questions to Consider

- **Is the "Words, Not Invented Icons" rule truly helping users, or is it an aesthetic dogma that hurts usability?** Under campus sunlight and across bilingual contexts (English/Spanish), human brains decode standardized glyphs (calendar, prayer hands, message bubble, person avatar) in a fraction of the time it takes to read 12px text in a tight row. Would adding paired icons dramatically improve glanceability?
- **Should Trainees truly have zero bottom bar?** While an uncluttered queue is noble, communication with teammates and students is core to fieldwork. Forcing all message checking behind a multi-step modal drawer creates friction. Would a minimal 2-tab bar (`Queue` · `Messages`) preserve focus while solving communication ergonomics?
- **Why did the mobile app introduce purple/violet (`#5C17E5`) when `DESIGN.md` mandates "Carbon & Paper" ink with monochrome chrome?** `DESIGN.md` explicitly warns against decorative purple gradients and mandates solid black ink as primary action. Has the mobile app drifted away from the core brand commitments of the desktop and web design system?
