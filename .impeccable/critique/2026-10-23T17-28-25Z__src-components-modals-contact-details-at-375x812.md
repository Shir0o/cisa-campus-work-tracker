---
target: /people/:contactId (src/components/modals/ContactDetailsModal.tsx at 375x812)
total_score: 20
max_score: 40
na_heuristics:
p0_count: 2
p1_count: 5
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1761/src/components/modals/ContactDetailsModal.tsx"
timestamp: 2026-10-23T17-28-25Z
slug: src-components-modals-contact-details-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; Assessment A read the source first, Assessment B measured the live render after; no second independent assessor).

# Critique: `/people/:contactId` — the contact detail at 375×812

Target: the full-screen person page the modal renders on a phone — `ContactDetailsModal.tsx`, `ContactHead.tsx`, `ContactStory.tsx`, `ContactInteractionItem.tsx`, `ContactComposer`, plus the Conversation pane and the About sheet it opens. Rendered live on the seeded emulator, signed in as the Trainee (`trainee.e2e@example.com`), on `/people/e2e-contact-lila` at 375×812. Not a mock.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Every story entry's provenance ("Logged 10/23 at 10:08 AM", the `coffee` type) is `text-on-surface-variant/40` — about **1.9:1**. The page is a fixed full-screen sheet that covers the bottom bar, so the shell loses its "where am I" answer entirely. |
| 2 | Match System / Real World | 3 | The vocabulary is the product's ("Cared for by", "What happened with Lila?", "About Lila Chen"). One desktop idiom survives on the phone: the Conversation's "⌘↵ to post" hint. |
| 3 | User Control and Freedom | 2 | With the More menu open, Escape closes the **whole page** and lands you back on /directory. The bottom bar and the drawer are both covered, so the only exit is a 32px-tall "‹ People". |
| 4 | Consistency and Standards | 1 | Three left gutters on one screen: 20px (header, tiles, primary buttons), 24px (body), 52px (the story). Page canvas paints `--surface` (card slate #F4F4F5) instead of paper. 15–36px targets against the repo's 44px phone rule (DRIFT #45). 10px type under DESIGN.md's 11px floor. The More trigger announced neither `aria-haspopup` nor its open state, while the Kind control did. |
| 5 | Error Prevention | 2 | "Delete Contact" sits in the More menu in the same plain ink as "Add prayer", no divider, no danger tone, on a 36px trigger. Per-row "Remove" is a 40×15 target 20px from a 20×15 "Edit". |
| 6 | Recognition Rather Than Recall | 2 | The date column and rail that make the timeline legible on desktop are still there on the phone, where they leave the entry's text 119px wide; "Edit"/"Remove" at 10px read as fine print rather than actions. |
| 7 | Flexibility and Efficiency | 2 | The at-rest composer's textarea is **49px** wide, so the one-tap "log what just happened" path is unusable; there is no quick action on a story row. |
| 8 | Aesthetic and Minimalist Design | 2 | The palette is respected, but the page reads as a grey slab with one giant bordered input; the story is a ragged narrow ribbon beside a wide empty margin. |
| 9 | Error Recovery | 2 | Phone validation blocks Save and says why (good), and removing an interaction is undoable — but an edit that clears a nullable field writes `changed email from undefined to` into the audit line, which is visible, permanent history. |
| 10 | Help and Documentation | 2 | Nothing on screen says the avatar or the name opens About; a screen reader gets "About Lila Chen" but a sighted trainee gets no cue. |
| **Total** | | **20/40** | **Acceptable (50%)** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic CRM drawer. The page says "Cared for by", offers *Log interaction* and *Prayer* as the two primaries, and calls the timeline "The story so far" — a ministry shape, not a sales shape. Where it drifts, it drifts as *layout*, not as voice: every rule in the page was written for a 1080px column and never given a phone case. The story's fixed `84px 14px minmax(0,1fr)` timeline grid, the composer's `is-rest` single row, and three stacked horizontal paddings (20 + 24 + 28) were each fine on desktop and each collapse at 375. The result is a screen where the words are right and the column holding them is 49px wide.

**Deterministic scan.** No `impeccable` CLI is installed in this checkout (`node_modules/.bin` has no `impeccable`), so the detector could not be run — reported, not estimated. The equivalent token checks I ran by hand in the live page: `--surface` = `--surface-container-low` = `#F4F4F5` (the page and its own composer box are the same colour); `--accent` = `#52525B`; `--text-mute` = `#A1A1AA` on `#F4F4F5` = **2.33:1**.

**Browser overlays.** No overlay detector was available in this session, so all contrast numbers below are computed from `getComputedStyle` in the live DOM rather than from an injected detector: `text-on-surface-variant/40` over the page ≈ 1.9:1; `--text-mute` over `#F4F4F5` = 2.33:1; `--on-surface-variant` over `#F4F4F5` = 7.03:1.

## Overall Impression

The right page for the job, laid out for the wrong device. Two measurements explain most of the score: the composer's textarea is 49px wide and a story entry's body column is 119px wide, both inside a 360px viewport. Everything else on the list is the same disease at lower severity — desktop columns, desktop gutters and desktop 10px metadata carried onto a phone unchanged.

## What's Working

1. **The two primaries are right.** *Log interaction* (solid ink) and *Prayer* (violet, the reserved hue for the spiritual) are the two things a trainee actually does on a walk, and they are 48px tall and full width. The hierarchy is correct before any fix.
2. **The edit form is already native.** 44px fields, 16px text (no iOS zoom), labels above inputs, Cancel / title / Save in a 44px header. Nothing to change there.
3. **Validation speaks.** "Phone number too short (need 10 digits)" appears inline, blocks Save, and is localized. Removing an interaction is undoable. The error-recovery bones are good; the story's audit copy is the one hole.

## Priority Issues

### [P0] The story's composer is a 49px-wide textarea
- **What**: `.cd-composer.is-rest .cd-composer-box { flex-direction: row }` puts the 156px switch cluster beside the text field inside a 245px box. Measured `.cd-composer-text` = **49×109px** at rest (215px once focused). The placeholder "What happened with Lila?" renders as six one-and-a-half-word lines.
- **Why it matters**: This is *the* input of the page. On a phone the trainee sees a hatched grey column and types into 49px.
- **Fix**: Below 720px the at-rest composer keeps the column layout, so the field owns the full 245px and the switch sits beneath it. At rest on a phone it now reads as one line of placeholder above a quiet chip row.
- **Suggested command**: `/impeccable adapt src/components/modals/ContactDetailsModal.tsx`

### [P0] A story entry's text column is 119px wide
- **What**: `.cd-story-entry` is `grid-template-columns: 84px 14px minmax(0, 1fr)` with 14px gaps, unchanged below 720px. With the body's 24px padding and the section's 28px padding, the body column measures **119px**. A single interaction wraps to six lines; a longer note becomes a ribbon.
- **Why it matters**: The story is the page. At 119px it cannot be read without scrolling vertically for every phrase, and the 84px date column is more than a third of the card.
- **Fix**: Below 720px the entry becomes a two-column grid — 12px dot/rail plus the body — with the date as a caption above the body. Body column measures 262px.
- **Suggested command**: `/impeccable adapt src/components/contact/ContactStory.tsx`

### [P1] One screen, three left gutters
- **What**: header/tiles/primaries at 20px, `.cdm-page-body` at 24px, `.cd-story` at 24+28=52px. Measured x-positions: name 92 (avatar at 20), "Log interaction" 20, "The story so far" 52, story text 52.
- **Why it matters**: The eye reads the ragged edge as unfinished, and the story — the most important column — is the one pushed furthest in.
- **Fix**: One phone gutter, 20px, matching the header. The section supplies no side padding of its own; the body does.
- **Suggested command**: `/impeccable polish src/components/modals/ContactDetailsModal.tsx`

### [P1] The story's provenance line is invisible (≈1.9:1)
- **What**: `text-on-surface-variant/40` on the "Logged 10/23/2026 at 10:08 AM" line and the type chip (`coffee`), at 10px.
- **Why it matters**: When and by whom something was written is the audit trail of a care relationship. At 40% it is decoration. WCAG needs 4.5:1 for body text.
- **Fix**: Full `--on-surface-variant` (7.03:1) at 11px — the DESIGN floor.
- **Suggested command**: `/impeccable colorize src/components/contact/ContactInteractionItem.tsx`

### [P1] The back affordance and the meta line are 2.33:1
- **What**: `.cdm-back` ("‹ People") and `.cdm-meta` (year · major · last contacted) both use `--text-mute` (`#A1A1AA`) on the page's `#F4F4F5`.
- **Why it matters**: "People" is the only way back — the bottom bar is covered — and at 2.33:1 it is the faintest thing on the screen. The one-line summary of who this person is is equally unreadable.
- **Fix**: Both move to `--on-surface-variant` (7.03:1).
- **Suggested command**: `/impeccable colorize src/index.css`

### [P1] Escape closes the page, not the menu
- **What**: `MoreMenu` handles outside-click only. The modal's `keydown` listener sees Escape first and calls `handleClose()`. Verified in the live app: open More, press Escape → URL becomes `/directory`.
- **Why it matters**: Escape is the universal "close the top layer". Here it discards the page the reader is on.
- **Fix**: The menu owns Escape while it is open (`stopPropagation`), and returns focus to its trigger.
- **Suggested command**: `/impeccable harden src/components/contact/ContactHead.tsx`

### [P1] Destructive and per-row actions are 15–36px targets
- **What**: More 36×36, Edit 54×30, back 74×32, Conversation 148×34, per-row Edit 20×15, Remove 40×15, the composer switch 24 tall, and the About sheet's tag × is 15×15. The repo's phone rule is 44px.
- **Why it matters**: One-handed, walking. And the two 15px-tall controls are *Edit* and *Remove* — a destructive action on a 15px target next to a 15px Edit.
- **Fix**: 44px minimum for every control on the page (visual size may stay smaller where it needs to, via padding). Per-row Edit/Remove become 44px-tall affordances at the 11px floor.
- **Suggested command**: `/impeccable adapt src/components/contact/ContactHead.tsx`

### [P2] Delete Contact is not marked as destructive
- **What**: The More menu renders "Delete Contact" in the same ink as "Add prayer" and "Delegate", no divider, no danger tone.
- **Fix**: Danger ink (`--danger`) and a hairline rule above it, at the end of the menu.
- **Suggested command**: `/impeccable harden src/components/contact/ContactHead.tsx`

### [P2] The page paints the card token as its canvas
- **What**: `.cdm-page { background: var(--surface) }` = `#F4F4F5`, the Soft Slate Card fill; paper is `--bg` `#FFFFFF`. `--surface-container-low` is also `#F4F4F5`, so the composer box has no separation from the page it sits on.
- **Fix**: Canvas is `--bg`. The composer box and the interaction bubbles regain their tonal step.
- **Suggested command**: `/impeccable colorize src/index.css`

### [P2] Two communication tiles leave a hole in a three-column grid
- **What**: `.cdm-comm { grid-template-columns: repeat(3, 1fr) }` with two children (a contact with a phone but no email) leaves an empty third column 101px wide.
- **Fix**: `repeat(auto-fit, minmax(0, 1fr))` so two tiles fill the row.
- **Suggested command**: `/impeccable polish src/index.css`

### [P2] The audit line can say `undefined`
- **What**: `executeContactUpdate` compares `formData.email` (`""`) to `contact.email` (`undefined`) and records `email: "undefined" → ""`. The story then renders "changed email from undefined to" and hides two more blanks behind "3 more changes".
- **Why it matters**: It is permanent, visible history on a person's page, and it is wrong.
- **Fix**: Compare against the normalised `contact.email || ""`, so clearing a field that was never set records nothing. A field that goes from empty to set now reads "set major to History" instead of "changed major from  to History".
- **Suggested command**: `/impeccable harden src/lib/contactUpdate.ts`

### [P2] Nothing locks the page behind the full-screen sheet
- **What**: `document.documentElement.scrollHeight` is 876 against an 812 viewport while the sheet is open. In this harness that costs 15px of width (visual viewport 360 of 375) and draws a scrollbar over the sheet; on iOS it lets the page rubber-band under the sheet.
- **Fix**: Body scroll lock while the mobile page is open, restored on close — the pattern `GlobalSearch` already uses.
- **Suggested command**: `/impeccable adapt src/components/modals/ContactDetailsModal.tsx`

### [P2] A dead or forbidden person link renders a blank page
- **What**: `/people/:id` for a contact the rules deny produces no snapshot at all (and a deleted id produces `exists: false`), so `selectedContact` stays null and the route renders `{null}` under the shell: a white page with no explanation and no way back except the bottom bar.
- **Why it matters**: People share and forward these links. The person on the other end gets an empty screen and cannot tell whether the app broke.
- **Fix**: The route now answers with the existing "Access Restricted" copy (which does not leak whether the id exists) and a 44px "Back to People" that returns to the directory.
- **Suggested command**: `/impeccable harden src/App.tsx`

## Persona Red Flags

- **Zion (Trainee, the seeded account, walking across campus)**: tapped the composer to log a conversation and got a 49px column; scrolled to read what he logged last time and read six lines of "Had a / warm / coffee / conversa / tion"; pressed Escape to dismiss the More menu and was thrown back to the People list, losing the page.
- **Sam (screen reader / low vision)**: the unread dot beside "Conversation" is a `span` with `aria-label` and no role, so it is announced as nothing; the 40%-opacity provenance line is invisible at low vision; the back link is the faintest element on the page; per-row Edit/Remove are 15px tall — unreachable by any motor-impaired tap.
- **Casey (one hand, notched phone)**: More is 36px inside a 44px-wide zone next to Edit at 30px tall — a mis-tap opens the menu with Delete in it; the story's 84px date column means half the screen is furniture.

## Minor Observations

- The Conversation pane opens full-screen with the title "Conversation" and no person's name — the reader loses whose thread this is.
- The pane's composer shows "⌘↵ to post" on a phone, where there is no Command key.
- `.cd-pane-dot` (7px) is the only unread signal and is not in any accessible name.
- Tag chips on the head are 10px, under DESIGN.md's 11px caption floor.
- The About sheet's section headings use the serif face; DESIGN.md reserves Literata for scripture. Pre-existing across the app, not touched here.
- The interaction avatar (`TT`, 8.5px) uses `bg-secondary-container` with no `aria-hidden`, so the initials join the accessible name of the row.
- React logs "Encountered two children with the same key" 18× on this route; the key itself was not printed by React's dev formatter, so the owner was not identified. Pre-existing, unrelated to layout — worth a small issue.
- `.cdm-page-body` scrolls inside the page while the page also scrolls; with the scroll lock the inner region becomes the only scroller, which is the intent.

## Questions to Consider

- **Should the person page keep the bottom bar?** Covering it makes back a 32px text link the only exit, and Messages/Questions unreachable from the screen a trainee spends the most time on. A full-screen sheet is right for a modal, but this is a route.
- **Is the timeline grid still the right shape below 720px?** The date column earns its 84px on a 1080px page; on a phone the date could be the caption of the entry.
- **Could the 44px rule be a lint rather than a critique finding?** Every phone screen in this epic has found the same class of defect; a measured test at 375 would catch it before review.

---

**Fixed in this pass**: both P0s (composer field 49px → 294px; story body column 119px → 302px with the date as a caption), and every P1 — one 20px phone gutter, provenance ink at 7.03:1 and 11px, the back link and meta line at 7.03:1, Escape closing only the More menu, and 44px hit areas on every control on the page (the tag ×, "+ add" and composer switch gain theirs from a pseudo-element so nothing changes shape). Of the P2s: Delete Contact is danger ink behind a hairline rule, the page canvas is paper `--bg`, two communication tiles fill the row, the audit line no longer says `undefined` ("set major to History"), the page behind the sheet is scroll-locked, and a dead or forbidden person link now answers with Access Restricted instead of a blank page.

**Measured after** (same seeded emulator, Trainee, 375×812): composer textarea 49 → 294px; story body 119 → 302px; story entry height 224 → 102px for the same content; document width 360 → 375 (no scrollbar over the sheet); `document.body.style.overflow` `visible` → `hidden`; controls drawing under 44px tall 10 → 3, of which the two composer-switch buttons now carry a 44px pseudo-element hit area and the third is the reply chip from the shared stream component.

**Filed as follow-up**: the Conversation pane's own controls (close 36px, mention 30px, post 36px, chips 28px), the "⌘↵ to post" hint shown on a phone, the pane header losing whose thread it is, the 40px PopupFrame close button, and the React duplicate-key console noise on this route.

**Not fixed, on purpose**: the head — back row, Conversation, hero, tiles, two primaries — is 475px of an 812px screen on a person with a phone and an email, 58% of the first view. Compressing it is a layout redesign (sticky hero, folded tiles), not a critique fix, and it is the strongest question this pass leaves open.
