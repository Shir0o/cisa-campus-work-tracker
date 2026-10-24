---
target: /settings (src/views/Settings.tsx at 375x812)
total_score: 16
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 6
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1774/src/views/Settings.tsx"
timestamp: 2026-10-24T15-18-12Z
slug: src-views-settings-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812, not on a mock.

# Critique: Settings — the one page that contains everything, at 375×812

Target: `/settings`, measured as `fulltimer.e2e@example.com` (Full-timer) at 375×812, on the seeded emulator through the dev server (`VITE_E2E_MODE=true`). The Student (`student.e2e@example.com`) render was measured too, because `/settings` has two different bodies.

**The brief says “sign in as Trainee”, and a Trainee cannot open this route at all.** `canAccessRoute('manager', '/settings')` is false — `allowedTraineeRoutes` in `src/lib/permissions.ts` is an allowlist that does not contain `/settings` — and `e2e/journeys/student-community.spec.ts` asserts it (`trainee.denied: [..., '/settings']`), as does `e2e/journeys/full-timer.spec.ts` (“a Trainee is redirected off /settings”). Verified live: signed in as `trainee.e2e@example.com`, `/settings` lands on `/`. The app already knows this: the **Trainee card in the page's own “Roles & access” section lists six sections and `Settings` is not one of them**. So this pass measured the page as the two roles that actually own it — the Full-timer (19 sections) and the Student/Community profile render (9 sections) — and filed the role question as **#1819** rather than changing a permission the e2e matrix asserts.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The chosen Appearance card was **lighter** than the two beside it (`#F3F3F3` against `#EAEAEC`), so the active theme read as a raised card, not a chosen one. The **Navigation** section accepted a tap on “Compact”, flipped `aria-pressed`, and changed nothing on screen — there is no rail below 1024px. |
| 2 | Match System / Real World | 3 | The vocabulary is the best on any screen in this app — “Going out together”, “Which team they're on”, “The day's goal”, “Your weekly reminders”, “A note on access”. Then the same page handed a phone three desktop layout controls and left the answer in a footnote. |
| 3 | User Control and Freedom | 2 | **19 sections, 10,801px, no index, no search, no collapse.** Language sits at y=2,415 and the reminder schedule at y=5,822. “Generate new token” replaces a live credential with no confirmation, on a 24px-tall button. |
| 4 | Consistency and Standards | 1 | Every card is **40px** radius where DESIGN.md says 24px — and larger than the 32px shell that contains it, inverting the Monotonic Radius Rule. Every text input is **24px** on a 49px field against a 10px spec. Every selected state is a **5% wash**, which the Inversion Rule forbids by name. |
| 5 | Error Prevention | 2 | Removal, purge and log-out are all guarded by a modal or a sheet. The exception is “Generate new token”: one tap on a 24px control silently invalidates the token pasted into the external attendance app. |
| 6 | Recognition Rather Than Recall | 1 | Nothing tells you what is on the page. To find “Language” a reader scrolls past every account, security, appearance, navigation, notification, reminder and release-note control, and to find the reminder schedule past the whole roster. “Off” appears twice in the same Security card. |
| 7 | Flexibility and Efficiency | 1 | Settings is a lookup task and there is no lookup: no jump list, no filter, no collapsible groups. The only search on the page searches your teammates. |
| 8 | Aesthetic and Minimalist Design | 1 | “Quick add by text” is **2,034px** — 19% of the page — of curl templates and Twilio instructions. “Roles & access” is **938px** of read-only documentation inside your own settings. Together, 27% of the page is reference material. |
| 9 | Error Recovery | 1 | A failed users query fell through to the same sentence as an empty search — **“No teammates or invites match your search.”** — with no retry. Reminder and goal writes are optimistic with no rollback, so a failed write looks applied. |
| 10 | Help and Documentation | 2 | “A note on access” explains a real safety decision in one plain sentence, and every integration carries steps. But the one sentence that says the Navigation section cannot work on this device is 12px at **3.62:1**, under the three cards it disclaims. |
| **Total** | | **16/40** | **Warm words, a 14-screen scroll, and a control that lies about its reach** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic settings template. It is a ministry's control room with the team's own nouns: trainees are *paired* and *going out together*, they sit *on a team*, and the shared day carries *a goal*. The Security section is a real, careful second-factor flow with the email-verification prerequisite explained before the button is offered. “A note on access” is the single best paragraph in the app's admin surface: it says *why* you cannot remove your own access, in the second person. A generic SaaS settings page has none of this.

Where it drifts is drift the other passes have already met in this codebase: **the page was designed for a 1040px column and the phone has never had a pass.** Twenty-eight containers carry `rounded-3xl` because `--radius-3xl` is 40px in this theme and nobody re-read the ladder after the token changed; every `t('settings.…', 'English fallback')` looked translated because the header of each section was — the other 48 keys were never added to either dictionary. It is a page that believes it is finished because the first screen of it is.

**Deterministic scan.** `impeccable detect` is not installed in this worktree (`npx impeccable` → missing package), so no CLI scan was run; every finding below is from the live DOM. The detector would not see a radius ladder, a card lighter than its neighbours, or a tap that changes a preference with no visible effect.

**Visual overlays.** Live renders at 375×812 (device scale 1) in English light, English dark (the theme control on this page works — dark was reached by tapping “Dark”, not by a local storage key), and Spanish light; plus the Student profile render and the invite sheet. Before-and-after captures of the Appearance and Navigation sections after the fixes.

## Overall Impression

The page is a well-written, well-meant control room that has never been through a phone pass, and it has grown to **10,801 pixels** — 14.3 screens — with no map. The first screen is genuinely good: the account card, the approval badge, the security section. Then the page keeps going for another thirteen screens, through a developer's curl playground and a role reference table, and the one control that cannot work on this device is rendered as three live cards whose disclaimer is the least legible text in its own section.

Nothing here needs a concept. It needs an honest phone pass: one section that stops pretending, five P1s closed, and a decision about whether “Settings” on a phone should be a list you can search or a scroll you survive.

## What's Working

1. **“A note on access.”** Two sentences, second person, and it explains a safety decision that most products leave to a support article: *“You can't remove your own access or change your own role — that's by design, so no one locks themselves out.”*
2. **The second-factor flow.** Verify email → set up → scan → six-digit code, each step gated on the previous one, with the reason stated before the disabled button rather than after it (“Your email address is not verified. Verify it before adding a second factor.”).
3. **The team's own vocabulary.** “Going out together”, “Which team they're on”, “The day's goal”, “Your weekly reminders”, “The tricky bit” — a Trainee reading this page knows they are in *this* app, not in a settings template.
4. **The pairing data model, surfaced honestly.** Earlier arrangements stay readable with their date ranges, and the free-trainee sentence names who is on their own this term (`Going out on their own this term: Trainee Three.`) instead of leaving a blank.
5. **The role reference is truthful.** The Trainee card says six sections and does not list Settings — which is exactly what `canAccessRoute` enforces. Very few apps' permission documentation survives a check against the guard.

## Priority Issues

### [P0] The Navigation section offered three controls that cannot do anything on a phone
- **What**: the section rendered three 101×150 cards (“Rail / Wide, all destinations visible”, “Compact / Icons only, labels on hover”, “Top bar / The original horizontal bar”) at y=1,324–1,763, **439px — 54% of the 812px viewport**. Tapping “Compact” flipped `aria-pressed` from `Rail` to `Compact` and changed nothing else in the render: there is no rail and no top bar below the `lg` breakpoint, so the preference is stored and never used. The only sentence that says so, `settings.navigation_help`, was **12px at 3.62:1**, placed *below* the three cards.
- **Why it matters**: this is a settings screen. A control that accepts a tap and produces no visible change is the one thing it cannot contain — the reader cannot tell a successful tap from a broken one, and the explanation is the least legible text in the section. On the device this critique is about, the section was half a screen of dead affordance.
- **Fix**: below `lg` the three cards are `display:none` and the reader gets one sentence — *“On a phone the bottom bar is always the navigation. The rail and the top bar are chosen on a computer.”* — in the normal body register (7.73:1). The cards stay for wide windows, unchanged except that the selected one now inverts. Browse Help stays on both. Measured after: the section is 313px and contains no tap that does nothing.

### [P1] Choosing Español left six of nineteen section titles — and every card inside them — in English
- **What**: with `cisa_language=es` the live page read `Cuenta y sesión / **Security** / Apariencia / **Navigation** / Notificaciones y alertas / Tus recordatorios semanales / Idioma / Novedades / **Getting started** / Roles y acceso / Tu equipo / Salir juntos / En qué equipo está cada uno / Horario de recordatorios semanales / La meta del día / El calendario compartido / **Data management & danger zone** / **Quick add by text** / **API & webhook console**`. **6 of 19** `<h2>` were English (32%). Inside them, the whole Security card, the whole role reference and the whole integration console were English, and so were the three Appearance cards (“Light / Warm paper”), the three Navigation cards and the language note you had just tapped.
- **Why it matters**: bilingual access is a product commitment, and the Language control lives on *this page*. A Spanish reader changed it and got a half-Spanish screen in which the section about their account's safety was the most English thing on it.
- **Root cause, measured**: 48 `t()` keys used by the view were absent from **both** `en.json` and `es.json` (both files hold 2,422 keys — parity is green, so `check:i18n` could never see it), so each fell back to its English literal. The Appearance/Navigation/Language/Roles constants were never keyed at all.
- **Fix**: the 48 missing keys are in both dictionaries; the Appearance, Navigation and Language cards, the four role cards (including the access chips, which reuse `nav.*`), the role names in the account badge and roster rows, and the untranslated notification-permission sentence all resolve through `t()`. Measured after: **17 of 19** headings Spanish; the two that remain are the two developer consoles, filed as **#1818**. A new unit test walks the view's source for every `t('…')` it asks for and fails if either dictionary lacks it — the guard that would have caught all 48.

### [P1] Warning-coloured text failed AA in six places, including the one that says your account has no second factor
- **What**: measured in the light theme — the Security “Off” badge 12px **3.87:1**, “Verify email” 12px **3.87:1**, “Gemini AI not configured” 11px **3.87:1**, “No sync token configured yet…” 12px **4.23:1**, the Navigation disclosure 12px **3.62:1**, and the webhook console's empty-state line 12px **3.27:1**. `--warn` is `#BA5900`; on a 10–15% wash of itself it lands under 4.5:1 every time.
- **Why it matters**: the two-step badge is the sentence that tells a reader their account is unprotected. It was the least legible text in its own card, in the section about account safety.
- **Fix**: the tint and the amber icon keep the signal; the words are ink (`--on-surface`, 16.5:1). The two `/70` paragraphs drop to the plain muted token (7.73:1). Measured after: **0 contrast failures in light, 0 in dark**, against 6 and 3 before. The one 3.68:1 run that remains is the “Set up second factor” button at `disabled:opacity-50` while the email is unverified — a disabled control, exempt, and its reason is written directly above it.

### [P1] Selected states were a 5% wash — the chosen theme was lighter than the ones beside it
- **What**: the Appearance, Navigation and Language cards expressed “chosen” as `bg-primary/5` (measured `#F3F3F3`) plus a 40%-ink hairline, against unselected `bg-surface-container` (`#EAEAEC`). The selected card was **nine levels lighter** than its neighbours, so it read as *raised*, not *chosen*; the only unambiguous cue was the icon colour. The reminder day chips and team chips used the same wash.
- **Why it matters**: DESIGN.md states the Inversion Rule by name — *“Selection and activation are expressed as solid ink inversion… never as a faint 6% tint”* — and this is the page where a reader picks their theme, their language and their shell. Three groups of three near-identical greys with no checkmark is a guess, not an answer.
- **Fix**: the chosen card inverts — solid `--primary` with paper text and an 80% note line, in both themes. Measured after: `#0A0A0B` on `#FFFFFF` ≈ **19.8:1** in light, and the same inversion in dark. The reminder/team chips are left as-is: they are 26px chips inside a pill row, where an inverted chip would read as a segmented control rather than a field of options — filed with the radius work in **#1817**.

### [P1] Three text fields were named only by their placeholder
- **What**: “Find a teammate…”, the quick-add description field, and the What's New video URL input had no `<label>`, no `aria-label` and no `aria-labelledby`. Playwright's own name resolution returned three unnamed inputs at y=3,024, y=4,481 and y=8,344.
- **Why it matters**: a screen-reader user met three anonymous edit fields on the screen that manages their team, their integrations and their account.
- **Fix**: `aria-label` on all three, through `t()` so it follows the reader's language. Measured after: **0 unnamed controls** across every button, link, select and field on the page.

### [P1] A failed team query said “No teammates or invites match your search.”
- **What**: the `users` `onSnapshot` error handler only called `console.error` and then `setLoading(false)` — so a denied or offline read fell through to the *empty search* state, the same sentence an empty filter produces, with no retry. The invitations listener swallowed its error the same way.
- **Why it matters**: this is the surface where a Full-timer approves people. A permissions failure, a dropped connection and a roster with nobody on it were indistinguishable, and none of the three offered a way out. It is the same escape the Messages pass found (#1764), on a screen where the empty state is a management decision.
- **Fix**: `role="alert"` — *“Couldn't load your team.”* — with a **Try again** button that re-subscribes. Test: the subscription errors, the alert renders, the search-empty sentence does not, and Try again subscribes a second time.

### [P1] Nothing on the page is findable — filed, not fixed here
- **What**: **19 sections, 10,801px, 14.3 screens** in a 755px pane, with no index, no jump list, no search and no collapsible groups. Section depths: Language y=2,415, “Your team” y=4,384, reminder schedule y=5,822, the day's goal y=6,457. “Quick add by text” alone is **2,034px** (19% of the page) and “Roles & access” is **938px** of read-only documentation sitting inside personal settings.
- **Why it matters**: settings is a lookup task. On a phone the page is a scroll you survive, and density is the only thing standing between a reader and the one control they came for.
- **Fix**: **none in this pass.** An index, a phone-side collapse, or moving the two developer consoles behind an “Advanced” door are each a structural decision that changes what this page is — larger than a fix, and the instruction for this pass was not to redesign Settings. Filed as **#1816** with these measurements. The P0 above removed the only section on the page that was *wrong* rather than merely long.

### [P2] Forty-eight of sixty-eight phone targets are under 44px — filed
- **What**: measured on the live page — reminder weekday chips **26px** tall (21 of them), team chips **26px**, both `Switch` tracks **44×24**, the account edit pencil **26×26**, the roster's ⋯ **32×32**, “Generate new token” **24px**, “Copy” **24px**, “Enable browser notifications” **36px**, and “Send test notification”, “Show getting started checklist” and “Scan & Purge…” all **38px**. Only 2 fall under the WCAG 2.2 24px floor (a checkbox inside a larger label, and an inline link).
- **Why it matters**: one-handed use while walking is the real context, and the weekday chips are the densest control on the page — seven 26px targets in a 296px pill row, repeated once per team.
- **Fix**: **none in this pass** — it is a sweep of ~40 class sites in a 3,549-line file, larger than the rest of this diff. Filed as **#1817** with the full table. It also carries “Generate new token”, the one unconfirmed destructive control on the page: one tap replaces the credential pasted into the ~/attd app.

### [P2] The radius ladder is inverted, page-wide — filed
- **What**: every card on the page (`rounded-3xl`) computes **40px** where DESIGN.md §Card says 24px — and the shell it sits in is 32px, so the child is larger than its parent (Monotonic Radius Rule). Every text input (`rounded-xl`) computes **24px** on a 49px field, where §Control/Input says 10px and the No-Stadium-Input Rule forbids `rounded-xl` under 60px. Buttons compute 24px against a 14px spec, and nested panels 32px inside the 40px cards.
- **Why it matters**: it is the same drift the Prayer list pass fixed for one card, at page scale; nothing about it is unreadable, so it did not distort a heuristic here — it is why Consistency scored 1.
- **Fix**: **none in this pass.** The cascade is the problem: dropping cards to 24px without dropping the inner `rounded-2xl` panels to `rounded-lg` would invert the ladder the other way, so 28 containers and 24 nested panels have to move together. Filed as **#1817**.

### [P3] Small duplications and mislabels
- **What**: “Off” is said twice in the Security card (`<p>Off</p>` plus an amber “Off” badge); `On`/`Off` inside every `Switch` track is hardcoded English; the language card's note was written in Spanish on the English page (“Traducción inteligente en vivo”); the flag emoji carried `role="img"` with the same `aria-label` as the visible word beside it, so a screen reader said “English English Default language”; the shared-calendar control is a raw 17×17 `<input type=checkbox>` rather than the shared `Switch` primitive.
- **Fix**: the two accessibility ones are fixed in this pass (the flag is now decorative, and the language note is keyed). The duplicated “Off”, the `Switch`'s English `On`/`Off` and the raw checkbox are left — the first is a copy decision, and the other two belong with the remaining translation and radius work (**#1818**, **#1817**).

## Persona Red Flags

- **Alex (Full-timer, one thumb, between meetings)**:
  - *Taps a layout option, nothing happens* — “Compact” stored a preference with no effect on a phone, and the disclaimer was 3.62:1 under the cards (fixed: the cards are not offered on a phone at all).
  - *Cannot find the setting* — wants the reminder schedule, scrolls past 5,822px of other people's settings (filed as **#1816**).
  - *The status that matters is the faintest* — “Off” on two-step verification at 3.87:1 (fixed: ink).
  - *One blind destructive tap* — “Generate new token” is 24px tall, unconfirmed, and invalidates a credential used by another app (filed as **#1817**).
- **Jordan (Spanish-first)**:
  - *Changed the language on the settings page and got a half-Spanish settings page* — the section on account security stayed entirely English (fixed: 17 of 19 headings, and the Security card, the role cards and the theme/language cards all translate).
  - *The chosen language card is one of two near-identical greys* (fixed: it inverts).
  - *Nothing announces which theme is on* for the same reason (fixed).
- **Sam (screen reader / keyboard)**:
  - *Three unnamed edit fields* on the roster, the integrations and the release notes (fixed).
  - *“English English Default language”* — the flag emoji carried `role="img"` with the same `aria-label` as the visible word beside it (fixed: the flag is decorative).
  - *A failed load announced as a search miss* — no alert, no retry (fixed: `role="alert"` + Try again).
  - Every switch on the page is a real `role="switch"` with `aria-checked` and a name, and every Appearance/Navigation/Language card is a real `aria-pressed` toggle — that part was already right.

## Minor Observations

- The Appearance cards are 101×118 with a 12px note that wraps to two lines (“Match my device”); the Navigation cards were 101×150 because “The original horizontal bar” wrapped to four lines in a 101px column. Three abreast is right for a desktop shell and tight for a phone.
- The roles card's count sentence is “{n} sections accessible” — a plural-only template. It reads “6 sections accessible” today; “1 sections accessible” is unreachable because no role has one, but the template has no singular.
- The Student/Community render of the same route is **3,985px** and nine sections — a third of the length. The Full-timer's page is long because it carries the whole team's admin, not because Settings is intrinsically long.
- The language switch is immediate and has no undo — choosing Español re-renders the page under the reader's finger, mid-scroll. It is the right behaviour, but there is no “still loading the translation” state.
- The page title and section headers are set in Plus Jakarta Sans via `font-serif`; DESIGN.md's Scripture Exclusivity Rule reserves Literata for scripture, and this file never uses it — consistent with the rest of the app, noted only.
- The bottom nav does not cover the last section: at `scrollTop=10046` the “API & webhook console” panel and “A note on access” sit clear of the 64px bar. The shell's clearance (#1795) is doing its job here — not reported.

## Questions to Consider

- **Should a Trainee have a Settings page at all?** The epic's brief assumed yes; the role matrix says no, the page's own role card says no, and two e2e journeys assert the redirect. A Trainee can still reach their own language and theme from… nowhere, today. Personal preferences (theme, language, reminders) and team administration (roles, invitations, purges) are two different pages wearing one route name; splitting them would be the honest fix, and it would make this page a third of its length for everyone who is not a Full-timer. Filed as **#1819** rather than decided here.
- **Do the two integration consoles belong on `/settings`?** “Quick add by text” (2,034px of curl, Twilio and GroupMe instructions) and “API & webhook console” are developer tooling with a destructive “Clear all webhook debugging logs”. They are gated on `isDev`, which includes Trainees who cannot reach the route — a gate that reads as a mistake rather than a policy.
- **Should the Roles & access reference stay inside personal settings?** It is 938px of documentation that answers “what can this role do”, which is a Help question. Its own access chips already point at the answer.
- **Is a native `confirm()` the right guard for “Clear all webhook debugging logs”?** It works on a phone browser and blocks the page while it is open, which is the worst of both worlds in a PWA. The purge tool already uses the shared popup frame.
- **Should the reminder day chips be a 7-way multi-select in a 296px pill row?** Seven 26px chips with no weekday header, plus an hour select, repeated once per team — it is compact and it is dense. A weekly rhythm is a real-world pattern that a different shape might carry better.

## What this pass changed (same PR)

- **P0**: the Navigation section is honest on a phone — three dead cards replaced by one sentence in body ink; the cards remain for wide windows.
- 48 missing dictionary keys added to `en.json` and `es.json`; the Appearance, Navigation and Language cards, the four role cards and their access chips, the role names in the account badge and roster, and the untranslated notification sentence all resolve through `t()`. 17 of 19 headings now read Spanish.
- The selected card in every chooser inverts to solid ink, per the Inversion Rule.
- Warning-coloured text is ink on its tint — 6 failing text runs in light and 3 in dark reduced to 0 in each.
- The three placeholder-only text fields are named.
- A failed team query says so and offers **Try again**, instead of impersonating an empty search.
- A new test walks the view's source for every `t('…')` it asks for and fails if either dictionary lacks it; three more cover the phone note, the labelled fields and the failed-query retry.

**Unverified**: the `lg` breakpoint behaviour on a real tablet (measured by CSS only); the coarse-pointer rules in this pass (headless Chrome reports `pointer: fine`); VoiceOver's reading order across the inverted cards; and whether the Spanish strings read naturally to a native speaker — they were written, not reviewed.
