---
target: /coordination (src/views/CoordinationNotes.tsx → src/views/CoordinationNotesMobile.tsx at 375x812)
total_score: 16
max_score: 40
na_heuristics:
p0_count: 2
p1_count: 6
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1772/src/views/CoordinationNotes.tsx"
timestamp: 2026-10-24T20-05-50Z
slug: src-views-coordination-notes-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812.

# Critique: Coordination Notes — the team's shared page, on a phone

Target: `/coordination`, signed in as `fulltimer.e2e@example.com` at 375×812, against the seeded emulator through the dev server (`VITE_E2E_MODE=true`).

**The brief says “sign in as Trainee”; a Trainee cannot open this route.** `canAccessRoute('manager', '/coordination')` is false — the trainee allowlist in `src/lib/permissions.ts` (`allowedTraineeRoutes`) does not include it, while `ROUTE_MIN_ROLE['/coordination'] = 'operator'`. Verified live: signed in as `trainee.e2e@example.com`, `/coordination` redirects to `/`. The inversion matters more than the deny: a **Student** (operator, level 1) may open it read-only, a **Trainee** (manager, level 2) may not — even though the page model ships a `Trainees · Staff & trainees` audience and `canViewBoardNotes` is written for level ≥ 1. So the page is designed for trainees and the router bounces them. This pass measured the page as the role that owns the *writing* surface, the Full-timer, and filed the role question as **#1849** rather than changing a permission the e2e matrix asserts. A Trainee's coordination surface today is nothing at all.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | The only save signal said **“Saved”** for an edit that never reached the server: with writes to the emulator refused, the toolbar flipped to Saved at **1348 ms**, and the edit was **gone after reload**. On the phone branch, delete and audience changes produced no confirmation of any kind. |
| 2 | Match System / Real World | 2 | The doc model is right — one page per gathering, kept by date, “Keep as a note”. But the to-do section is headed **“What we're praying for”** / “Por quienes oramos” while it lists to-dos, and the page never says **who** wrote it. |
| 3 | User Control and Freedom | 1 | Tapping the 28px trash deleted the page with **no confirmation, no toast and no Undo** — `UndoSnackbar` and the flash toast were rendered only in the desktop branch. On the phone, a deleted page had no way back at all. |
| 4 | Consistency and Standards | 2 | Phone and desktop render different surfaces for the same action: the desktop offers undo, the phone offered silence. The page also printed its own title twice, 54px apart, at the same 24px. |
| 5 | Error Prevention | 1 | The two destructive controls sit side by side: “Keep as a note” (130×30) and Delete (28×28), with no confirmation on either side. A failed save is invisible. |
| 6 | Recognition Rather Than Recall | 2 | Twelve icon-only formatting buttons (30×30, `title` only) with no labels, and on a long page they scroll out of reach entirely, so you must remember they exist above. |
| 7 | Flexibility and Efficiency | 2 | ⌘K / `/` focus search, and the selection bubble (to-do · note · link · assign) is a genuinely good power gesture. But formatting mid-document is unreachable, and the phone has no search-free quick path to a page other than scrolling. |
| 8 | Aesthetic and Minimalist Design | 2 | The body text is calm and well set. Above it: **436px** of hero, search and section head before the first page card (54% of an 812 viewport), and a document that opens with its own title printed twice. |
| 9 | Error Recovery | 1 | No failure state on save, no retry, no undo on the phone, and the Trash route is not linked from the mobile surface. |
| 10 | Help and Documentation | 2 | The intro explains the page model in one honest sentence (“nothing important should live in one person's inbox”). Nothing explains the audience ladder, autosave, or that a deleted page is recoverable. |
| **Total** | | **16/40** | **Poor — a real document editor whose phone shell cannot tell you whether your work survived** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic wiki. A page *is* a gathering: it carries a date, a weekday, a place, a time, a session status and an audience, and it lives in a folder grouped Pinned / This week / Earlier. “Keep as a note” promotes a page into a records-and-learnings archive with a series; the audience ladder (Team → Trainees → Everyone) is the ministry's own sharing rule, not a permission table. The selection bubble that turns a highlighted line into a to-do, a note, a link or an assignee is the one gesture that could only exist in this product. That is a design with a point of view.

Where the authorship thins out is the phone pass. `CoordinationNotesMobile.tsx` re-implements the list and the detail chrome — and re-derives the copy by hand, which is where “The Board”, “No pages are open to you just yet.”, “Today”, “Pinned” and a whole English to-do sentence leaked into the Spanish render. The same branch also dropped the two elements that make the desktop safe (toast + undo snackbar) while keeping the destructive control. The result reads as two products: a careful document editor and a phone view that forgot the confirmations.

**Deterministic scan.** `impeccable detect` is not installed in this worktree, so no CLI scan was run; every finding below is from the live DOM. A detector would not have caught a snackbar rendered into a branch that is not mounted, a save indicator that does not await its own write, or a sticky element trapped inside a non-scrolling ancestor.

**Visual overlays.** Live renders at 375×812 (device scale 1) in English and Spanish, in read and edit mode, with short and long documents, plus a delete/undo cycle and a write-failure injection. Dark mode was **not** observed.

## Overall Impression

The page model is the best thing in this app and the phone almost loses it. You open a gathering, you see a real document with a title, a checklist and a quote — and then you cannot tell whether your sentence was saved, you cannot format the paragraph you are in, and the trash icon next to “Keep as a note” removes the page without a word.

The single biggest opportunity is not visual: it is **making the phone tell the truth**. Two of the three defects that matter are the same defect — the mobile branch renders the document but not the feedback.

Every fix below is small and local: one snackbar moved into a shared branch, one promise awaited, one helper that drops a repeated heading, one CSS rule that lets the toolbar stick, one provenance line, one locale sweep.

## What's Working

1. **The doc model.** Title, date, weekday, place, time, status and audience on one page, grouped by date with pinned pages first. Nobody has to explain what a page is; the header says it (`.bdm-hero` + `coordination.page_per_gathering`).
2. **The selection bubble.** Highlight a line and you get Make a to-do · Note · Link · Assign in a pill above the text, with `@` opening the assignee list. It is the only interaction here that could not be lifted into another product.
3. **The list card.** Today + audience badges, a serif title, a two-line preview and “3 to do” in a 109px card — scannable in one glance, and the only place the phone explains a page before you open it.
4. **The reading view.** 15px body at a sane measure, real task lists, a blockquote with a soft accent rule. It reads as a page, not as a form.

## Priority Issues

### [P0] The save indicator said “Saved” for an edit that was never written
- **What**: `scheduleSave` fired `onSaveMarkdown(...)` without awaiting it and then called `setSaved(true)` on the next line. `saveMarkdown` swallowed every error into the global handler, so nothing could ever set the label back. Measured: “Saving…” at **125 ms**, “Saved” at **1348 ms** after a keystroke. With Firestore requests to `:8080` rejected, the toolbar still read **“Saved”**; after reload, the typed character was gone (the persisted heading was `xMonday kickoff — week 9`, without the later `Y`).
- **Why it matters**: this is a writing surface. The one status cue it offers is the one you cannot trust, and the failure mode is silent loss on exactly the network a phone has.
- **Fix**: `saveMarkdown` now returns `Promise<boolean>`; `persistDocEdit()` awaits it and maps the outcome to `saved | failed`; the label is a `role="status"` live region reading **Saved / Saving… / Not saved** (with a hint on the failed state), and the task-sync side effects only run after a save that landed. Offline writes therefore stay on “Saving…” until the SDK flushes rather than claiming success. Covered by three unit tests on the outcome mapping plus the component wiring.

### [P0] A page could be deleted on the phone with no confirmation, no feedback and no way back
- **What**: tapping the 28×28 trash called `softDeleteBoardDoc` immediately and then `showUndoSnack(...)`. Both the snackbar and the flash toast were rendered **only in the desktop branch** (the mobile branch returned `<CoordinationNotesMobile/>` alone), so the phone got neither. The page vanished from the list and the only copy sat behind `/coordination/trash`, a route the mobile UI never links to. The same silence swallowed audience changes: switching “Team · Full-timers” → “Open · Anyone in CISA” produced no confirmation at all.
- **Why it matters**: it is the page's only destructive action, it changes what the whole team can see, and it sits next to a benign control on a 28px target. Losing a page silently is the worst thing this screen can do.
- **Fix**: the mobile branch renders the same flash toast and `<UndoSnackbar>` as desktop (toast lifted above the tab bar at `bottom-24`), both announced with `role="status"`. The delete button is now a 44×44 target with its own `bdm-delete` hook. Test: deleting a page at mobile width surfaces **Undo** and “Page moved to Trash”.

### [P1] Every page printed its title twice
- **What**: the title input renders the page name, and the body's first line is `# <name>` — `newDocMarkdown()` seeded exactly that. In the read view the two headings measured 24px/500 at y162 and 24px/700 at y216, **54px apart with identical text**; the accessibility tree carried two headings with the same name (one `h1`, one `h2`).
- **Why it matters**: every page, from the moment it is created, looks like a rendering bug. On a 375px screen it eats 65px of first-viewport height for nothing.
- **Fix**: `newDocMarkdown()` no longer seeds the heading, and `bodyMarkdownForDisplay(md, title)` drops a leading heading that only repeats the title — used by the read view, the Spanish reading view and the editor's seed, so existing pages heal on first open. Stored markdown is never rewritten wholesale. Tests: the helper's three cases, the new-doc markdown, and a component test asserting exactly one heading named after the page.

### [P1] On a long page the formatting toolbar and the save state left the screen
- **What**: `.bdm-docwrap` grew with the document, so the shell pane became the scroll container and `.bdoc-fs-toolbar`'s `sticky top-0` never engaged. Measured on a 1688px page: at `scrollTop 560` the toolbar sat at **y −280** (280px above the viewport), taking the only save indicator with it.
- **Why it matters**: the longer the page, the more you need bold, a checklist or a quote — and the less reachable they are. This is the exact moment the phone is the only device you have.
- **Fix**: `.bdm-docwrap` no longer clips the scroll, the toolbar sticks at 62px (under the pinned Pages/Done bar), and the save state moved into that top bar so it is visible even when the toolbar is not. The toolbar is 2 rows (38×44 buttons) instead of 2 rows of 30×30.

### [P1] Nobody could tell who wrote or last touched the page
- **What**: every save writes `updatedByName` (and `createdByName`), and no surface ever rendered either. A shared, live-edited document showed its date, its place, its audience — and no author.
- **Why it matters**: the brief for this page is a team doc. “Who wrote this, whose note am I editing” is the first question a reader has, and it was the one fact the header omitted.
- **Fix**: a “Last edited by {name}” line in both the reading head and the editor head, from the data already stored.

### [P1] Controls sat under the touch minimum
- **What**: toolbar buttons **30×30**, delete **28×28**, Share **36×28**, audience select **226×22**, Markdown toggle **108×29**, task checkboxes **18×18**.
- **Why it matters**: one thumb, walking, and a destructive control three pixels from a benign one.
- **Fix**: 38×44 toolbar buttons, 40px minimum on the head controls, a 44×44 delete, 44px Edit, 22px checkboxes. The visual density is unchanged; only the hit area grew.

### [P1] Spanish lost seven strings on the page list
- **What**: the mobile branch hardcoded “The Board”, “No pages are open to you just yet.”, “Pinned”, “Today”, the to-do sub-line, the empty to-do sentence and “(you)” — all rendered in English inside a Spanish page. The desktop to-do and notes sub-lines were hardcoded too, and the mobile card's audience badge read `BOARD_AUDIENCE[...].label` instead of the translated key.
- **Why it matters**: this is a bilingual product; a section that mixes languages reads as unfinished, and the to-do sentence is the page's instruction for its own feature.
- **Fix**: every one of them now goes through the existing keys (`pin`, `today`, `todo_sub`, `all_clear`, `todo_open_count`, `you_suffix`, `notes_sub`, `audience_*`), with two new keys for the empty list and the eyebrow. **Not fixed** (needs app-wide date work): `weekdayOf`/`dateLabelOf` and the `DOC_STATUS` chips still print “Saturday, Oct 24” and “Today” in Spanish — filed as a follow-up (**#1850**).

### [P1] The to-do section was titled as if it were the prayer list
- **What**: the section headed “What we're praying for” / “Por quienes oramos” contains the team's to-dos (“Every to-do the team is carrying”), not prayers. The app has a separate prayer list; this screen shares its vocabulary by accident.
- **Why it matters**: on a page whose whole job is separating “what we talked through” from “who's holding what”, a heading that names a different feature makes the reader doubt which list they are looking at.
- **Fix**: the heading reads **What we're holding** / “Lo que estamos sosteniendo”, and the sub-line is the existing `todo_sub` key with the live count. A stale assertion in `CoordinationNotes.test.tsx` was updated with it.

## Persona Red Flags

- **Casey (distracted mobile user, one thumb)**:
  - *“Did that save?”* — the answer was always “Saved”, including when it was not (fixed).
  - *Deleted the page by reaching for “Keep as a note”* — 28px target, no confirmation, no undo (fixed: 44px + snackbar).
  - *Cannot format the paragraph she is in* — the toolbar was off-screen on a long page (fixed: it sticks, and the save state lives in the top bar).
  - *The page starts below the fold* — the first page card sits at y436 of 812 (not fixed; #1851).
- **Sam (screen reader / keyboard)**:
  - *The save state announced nothing* — it was a plain span that changed text; it is now `role="status"` with `aria-live="polite"`.
  - *Two headings with the same name* per page (fixed).
  - *“Link to this section” is 16×16 at `opacity: 0`* — invisible on touch, still focusable and announced (not fixed; #1852).
  - *The title field has no label* — it announces the placeholder “Untitled page” as its name (not fixed; #1852).
- **Zion (Trainee, the person the page is written for)**:
  - *Cannot open the page at all*: `/coordination` bounces to `/` (#1849).
- **Alex (Full-timer keeping the notes)**:
  - *Has to scroll back 280px to bold a line* (fixed).
  - *Cannot tell whose note it is* (fixed: last edited by).

## Minor Observations

- The mobile card's accessible name concatenates every badge, the title, the preview and the to-do count into one 180-character string — verbose but accurate.
- Two near-identical to-do sections are rendered from two places in `CoordinationNotes.tsx` (the mobile `TodoSectionComponent` and the desktop return). One copy of a fix is easy to miss — it caught this pass once.
- Dead CSS still references `.bdoc-toolbar`, `.bdoc-md-toggle` and `.bdoc-toolbar-right`, class names the markup stopped using; the live toolbar is `.bdoc-fs-toolbar`. Left alone.
- `.bdm-hero` repeats “The Board” as an eyebrow on a screen whose title already says “Coordination Notes”; the eyebrow is the only English word left on the Spanish list until this pass.
- The empty Pages state is centred italic text with a dashed border and no action — for a role that can edit, “New page” is 300px above it.
- The reading view's “Link to this section” anchors are `opacity-0` until hover, so touch users can tap a 16px invisible link inside a heading.
- The search field's placeholder truncates at 375px (“Search pages, headings…”), which is acceptable but means the ⌘K hint is never visible on a phone.

## Questions to Consider

- **Should a Trainee be able to open this page?** The route says no; the audience model, the notes archive and the read-along intro say yes. That is a product decision, filed as #1849 rather than changed here.
- **Is a markdown body that repeats the title still the right model?** The page has a title field *and* a body that conventionally starts with `# title`. This pass makes the duplicate invisible; the cleaner model is a body with no title heading at all, which is where `newDocMarkdown()` now points.
- **Should a failure be visible as a state or as an action?** “Not saved” is honest; “Not saved — retry” would be kinder. Firestore already queues offline writes, so the retry may be a no-op the reader does not need.
- **Does the phone need all eleven formatting buttons?** They cost two rows of the viewport forever. A shorter phone set (bold, italic, list, checklist, quote) plus the Markdown toggle for everything else is worth a pass.

## What this pass changed (same PR)

- The save label follows the write's outcome, and says **Not saved** when it fails; it is a live region.
- The phone gets the flash toast and the Undo snackbar; delete is a 44×44 target.
- A page prints its title once, in the reading view and in the editor.
- The formatting toolbar sticks under the pinned Pages/Done bar; the save state lives in that bar.
- Pages say who last edited them.
- Every control in the page header and toolbar meets a 40–44px hit height.
- Spanish: the mobile list, the to-do section, the notes sub-line and the audience badge are translated.
- The to-do section is called “What we're holding”.

**Unverified**: dark mode; offline writes that stay pending longer than the 10s observation window (the SDK was given ~3s to flush); the iOS keyboard's interaction with the sticky toolbar; VoiceOver's reading order over the toolbar and the live region; and the coarse-pointer hit areas on real hardware (headless Chrome reports `pointer: fine`, so the new sizes were measured with the rules active but not under a thumb).
