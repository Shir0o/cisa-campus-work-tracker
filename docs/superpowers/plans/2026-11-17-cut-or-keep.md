# Cut or Keep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every part the audit cut, and build the few reworks it called for, one reviewable PR per task.

**Architecture:** Cuts first, smallest-blast-radius last, so each later task works on a smaller app. Each task is one branch stacked on the previous task's branch and one PR whose base is that branch. Removals delete code, rules branches, query contracts, e2e specs, i18n keys and seam paths together. Builds follow TDD.

**Tech Stack:** React + Vite web (`src/`), Expo React Native (`apps/mobile/`), shared `packages/core`, Firestore + RTDB rules, Express `server.ts`, Firebase Functions (`firebase-functions/`), Vitest, Playwright on the emulator.

**Spec:** `docs/superpowers/specs/2026-11-17-cut-or-keep-design.md` (section numbers below are the spec's).

## Global Constraints

- "Cut" means delete the code and the feature, not hide it.
- Users who count: Full-timer (`admin`) and Trainee (`manager`) only.
- Never delete the data record under a cut page unless the spec says so; existing open question/nudge items keep working until closed.
- Rules, query contracts (`src/test/queryContract.test.ts`), rules tests and e2e journeys follow each cut (AGENTS.md §8). `npm run check:seams` must pass: remove seam paths that no longer exist, and keep every seam guarded.
- Firestore rules: `contacts` update sits near the 1000-expression ceiling; Set has no `isEmpty`/`isSubsetOf`.
- Toolchain: Node 24 (`nvm use`); JDK 21 for emulators (`export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`).
- Local gate per task, in order: `npm run typecheck && npm run lint && npm run build && npm run check:i18n && npm run check:seams`, plus only the test files the task touched, plus `npm run test:e2e:emulator -- e2e/<spec>.spec.ts` for any spec added or edited. No full local suite. `apps/mobile`: `npx tsc --noEmit` in `apps/mobile`.
- Never run the web dev server against prod (it writes to prod Firestore as Tony). No browser clicking that saves.
- `server.ts` and some files hold the owner's email; a local privacy guard can refuse a grep that reads them. Read those files with the Read tool, and never copy the address anywhere.
- Commits end with the Co-Authored-By line from the session; PR bodies end with the Claude Code line. No model names in commits or PRs.

## Review Focus

1. **A deleted route someone has bookmarked** (`/outreach`, `/visits`, `/messages`, `/questions`, `/board`, `/suggestions`, `/admin/feedback`, `/bible-study/read`, phone `journey`, `ask`): lands on My Day, not a blank page or crash. Each cut task adds a router test asserting the redirect.
2. **Existing documents of a cut kind** (an old `visits` doc, an `outreach` contact source, an open question, a per-prayer `teamPrayer` flag, a Student user doc): the screens that read contacts and prayers still render them. Each migration task asserts this with the legacy fixtures.
3. **The one Student account signs in after the role cut:** an unknown legacy role gets no access instead of crashing, and Task 1's downgrade script moves that account to an unapproved Trainee. Task 1 tests `effectiveRole` on an `operator` doc.
4. **A push for something now silenced still sends from an old code path** (chat, conversation message, new contact): Task 13 asserts each silenced writer no longer calls `sendNotification`.
5. **Quick add parses a sentence wrongly** (two names, no name, a name matching two contacts): nothing saves without the preview, and an ambiguous match is shown, not guessed. Task 18 tests all three.

---

## Execution

Run tasks **serially** in one isolated worktree branched from `origin/main`, one subagent per task, each followed by a fresh reviewer. Branch `audit/NN-<slug>`, each from the previous task's branch; PR base is the previous branch (Task 1's base is `main`). Push and open the PR; never merge. Model and effort per task are in each heading.

### Task 0: Commit the spec and plan — (me)
- [ ] Branch `audit/00-spec` from `origin/main`; commit the two docs; push; PR "docs: cut-or-keep audit spec and plan".

---

## Phase 1 — Cuts

### Task 1: Remove the Student and Community roles (spec §1) — opus, xhigh
**Files (known):** `src/lib/permissions.ts`, `packages/core/src/permissions.ts`, `src/views/landings/LandingStudent.tsx`, `LandingCommunity.tsx`, `Landing.tsx`, `src/components/AuthProvider.tsx`, `apps/mobile/src/lib/AuthProvider.tsx`, `src/lib/impersonate.ts`, `packages/core/src/impersonate.ts`, `src/components/layout/ImpersonatePicker.tsx`, `src/views/Settings.tsx` (role picker), `apps/mobile/src/components/member/*`, `packages/core/src/memberHome.ts`, `src/components/landing/UpcomingEventsRsvp.tsx`, `src/lib/rsvp.ts`, `packages/core/src/rsvp.ts`, `packages/core/src/data/rsvp.ts`, `firestore.rules` (`isOperator`/viewer branches, `events/*/rsvps`), `e2e/journeys/student-community.spec.ts` (delete), `e2e/seams.json`, both `en.json`.
**Interfaces:** Produces `AppRole = 'admin' | 'manager'`. `effectiveRole(raw: string | null): AppRole | null` maps legacy `operator`/`viewer`/`student`/`community` to `null` (no access, no crash); the downgrade script below handles the one real account.
- [ ] Inventory every reference to `operator`, `viewer`, `student`, `community` as a role (not as a contact field like `year`); list them in the PR body.
- [ ] Failing tests: `permissions.test.ts` — `hasMinRole` and route gates accept only the two roles; `/outreach`-style viewer gates gone; `firestore.rules.test.ts` — an `operator`-role user is denied what it was allowed; router test — `/bible-study/read` redirects home.
- [ ] Remove the roles, homes, RSVPs, member screens, personas, rules branches; keep sign-up and "Moving up a year".
- [ ] Rules tests + query contract under the emulator pass; delete `student-community.spec.ts`; update `impersonation.spec.ts` to the two roles and run it.
- [ ] Data: script `scripts/downgrade-legacy-roles.ts` (dry run default, `--commit` flag) that sets any `operator`/`viewer` user to `manager` with `approved: false`. Do not run `--commit`; list it in the PR as a post-merge step for Tony.
- [ ] Gate, commit, push, PR.

### Task 2: Remove Spanish (spec §17) — sonnet, medium
**Files:** `src/locales/es.json`, `apps/mobile/src/locales/es.json`, `content/help/*.es.md`, i18n init (web + mobile), Settings language section, every `isSpanish` branch (11 web files), `firebase-functions/src/translate.ts`, `translateFirestore.ts`, `translations` rules match, `scripts/check-hardcoded-ui-strings.ts` if it reads `es`.
- [ ] Failing test: i18n init resolves only `en`; a stored `es` preference falls back to `en`.
- [ ] Delete files and branches; keep the `t()` system with English.
- [ ] Gate (including `check:i18n`), functions `tsc`, commit, push, PR.

### Task 3: Remove Outreach (spec §2) — opus, medium
**Files:** `src/views/Outreach.tsx`, `apps/mobile/app/outreach.tsx`, `apps/mobile/src/components/ft/OutreachScreen.tsx`, `apps/mobile/src/lib/useOutreachData.ts`, `apps/mobile/src/lib/data/outreach.ts`, `packages/core/src/outreach.ts`, `packages/core/src/data/outreach.ts`, nav entries (web + `FtMoreScreen`), `permissions.ts` (`canSeeOutreach`/`canLogOutreach`), `/outreach` rules match, outreach auto-ask in `packages/core/src/toAsk.ts` (the outing source only; keep text-reach logic), `usageStats.ts`.
- Keep the contact "where we met" field.
- [ ] Failing tests: `/outreach` redirects home; to-ask derivation no longer produces outing lines but still produces text-reach lines.
- [ ] Delete; gate; commit; push; PR.

### Task 4: Remove BNPB suggestions (spec §4) — opus, medium
**Files:** `src/views/SuggestionsQueue.tsx`, `src/components/landing/BnpbReviewCard.tsx`, `server.ts` (`/api/bnpb/sync` and token routes — read with Read), `users/*/interactionSuggestions`, `suggestionLinks`, `notACisaPeople`, `bnpb_sync_tokens` rules matches, Settings token UI, related indexes in `firestore.indexes.json`.
- [ ] Check whether `packages/core/src/contactMatch.ts` is used by sign-up or Smart Import; keep it if so.
- [ ] Failing tests: `/suggestions` redirects home; rules deny the removed collections.
- [ ] Delete; gate; commit; push; PR. Draft (do not file) the BNPB ticket text in the PR body.

### Task 5: Remove Questions for the team (spec §9) — opus, medium
**Files:** `src/views/Questions.tsx`, `apps/mobile/app/ask.tsx`, `src/components/landing/AskStack.tsx`, `AskTheTeam.tsx`, `QuestionsPointerCard.tsx`, nav entry, question reminders in `firebase-functions/src/reminders.ts`.
- Open questions still render and can be answered where they already show until closed; no UI creates one.
- [ ] Failing tests: `/questions` and phone `ask` redirect; reminder schedule skips questions; an open legacy question still renders (fixture).
- [ ] Delete; gate; commit; push; PR.

### Task 6: Cut Messages chats; rebuild Announcements (spec §20) — opus, high
**Files:** `src/views/Messages.tsx`, `src/services/chat.ts`, `apps/mobile/app/(tabs)/messages/*`, `src/components/modals/ChatDetailsModal.tsx`, `chatRooms`/`messages` rules, `e2e/journeys/messages-keyboard.spec.ts` (delete), nav.
**Interfaces:** Produces collection `announcements/{id}`: `{ body: string, authorId, authorName, createdAt, gotIt: map<uid, timestamp> }`. `postAnnouncement(body: string): Promise<string>` (Full-timer only), `markGotIt(id: string): Promise<void>`, `useOpenAnnouncements(uid): Announcement[]` (no `gotIt[uid]`), `whoHasNot(a: Announcement, team: User[]): User[]`.
- [ ] Failing tests: rules — Full-timer creates, Trainee cannot create, any approved user may set only their own `gotIt.<uid>`; `whoHasNot` returns the right names; posting writes one notification per user (so push follows from the bell).
- [ ] Build: compose box for Full-timers (on My Day), card on My Day web + phone until Got it, "4 of 6 got it" with names for the poster. Migrate nothing from the old room.
- [ ] Remove chats and the Messages page; `/messages` redirects home. @mentions in contact conversations untouched.
- [ ] Update `notification.spec.ts` or `full-timer.spec.ts` with: post → Trainee sees card → Got it → poster sees count; run it.
- [ ] Gate; commit; push; PR.

### Task 7: Visits become an interaction type (spec §5) — opus, high
**Files:** `src/views/Visits.tsx`, `VisitsMobile.tsx`, `src/components/visits/*`, `visits`/`homes` rules, nav, `LogInteractionModal.tsx`, interaction type list (core), contact story rendering.
**Interfaces:** Interaction type `'visit'`; `logInteraction` accepts `contactIds: string[]` (writes one interaction per contact, same `groupId`).
- [ ] Failing tests: logging a visit for 3 people writes 3 interactions sharing a `groupId`; a legacy `visits` doc's linked interaction still renders in the story (fixture); `/visits` redirects.
- [ ] Build the type + multi-person pick; delete the page, cards, roster, stats.
- [ ] Gate; commit; push; PR.

### Task 8: Journey board → Directory; Directory lean (spec §22, §23) — opus, high
**Files:** `src/views/OutreachBoard.tsx`, `OutreachBoardMobile.tsx`, `src/components/pipeline/PipelineMatrix.tsx`, `src/lib/board.ts`, `packages/core/src/board.ts`, `stageTones.ts` (colours), `src/views/Directory.tsx`, `src/views/Settings.tsx` (new Steps section), nav.
- Directory: add "Not yet placed" to the step filter; remove background, interests, has-phone, custom date filters, bulk set-kind and bulk tag, header counts, row Reach. Keep copy emails.
- Settings › Steps: add, rename, reorder, remove-with-reassign (moved from the board; no colour).
- [ ] Failing tests: step filter "Not yet placed" returns contacts with no stage; removing a step reassigns its contacts; `/board` redirects to `/directory`.
- [ ] Update `trainee.spec.ts` / `full-timer.spec.ts` where they used the board; run them.
- [ ] Gate; commit; push; PR.

### Task 9: Settings, Help, Reports, Smart Import lean (spec §14–16, §26 cuts) — sonnet, high
- Settings: remove roles & access cards, Quick add channels (SMS, WhatsApp, GroupMe, Siri recipe, playground), API & webhook console, What's New. Server: remove the matching text-intake and webhook routes (`webhook_logs`, `groupme_aliases` rules).
- Help: keep `getting-started` and `privacy-and-data`; delete other articles; delete `content/whats-new/*` and its loader; delete "How this works" (`apps/mobile/app/tutorial.tsx` + web entry).
- Reports: remove PR-written outcome sentence, reply mirroring with GitHub (both directions), owner view, `/admin/feedback` (`FeedbackList.tsx`). Keep button, issue, Your reports, canned outcomes, outcome push.
- Smart Import: remove interactions/discussions extraction and sample text from the modal. **Keep** the server parse endpoint (Task 20 extends it).
- [ ] Failing tests: `/admin/feedback` redirects; Your reports shows the canned sentence for each outcome; Smart Import preview lists only contacts.
- [ ] Gate; commit; push; PR.

### Task 10: Page leaning A — Looking back, Gatherings, Around, To ask (spec §6–8, §10) — sonnet, medium
- Looking back: remove kind and teammate filters, stats, `HistoryMobile.tsx`. Keep stream, show older, search.
- Gatherings: remove stats card, kinds filter, RSVP count, `AttendanceMobile.tsx`. Keep everything else including Attendance Tracker sync.
- Around: remove Reach button.
- To ask: remove Delegate (`DelegateSheet` ask path), team filter, Clear done. **Add** a Full-timer web nav item "To ask" → `/ask`.
- [ ] Failing tests: nav shows "To ask" for `admin` only; To ask still ticks off a line when its signal clears.
- [ ] Gate; commit; push; PR.

### Task 11: Page leaning B — Combine, Bible study, Coordination, Vault (spec §3, §11, §18, §19) — sonnet, high
- Combine: delete `CombineTags.tsx` and tag guesses; keep standard tags list and everything in combine contacts.
- Bible study: delete `BibleStudyRead.tsx` (`/bible-study/read`) and the index's second column. Keep entry points.
- Coordination: remove Trainee read access (route + rules: `board_docs` read becomes admin-only), Notes & learnings, AI Insights sidebar, `CoordinationNotesMobile.tsx`, `EmbedCoordinationDoc.tsx` and its custom-token path, mobile `coordination/*`. Keep live editing, guest link, trash, pin/reorder, links, full screen, page search.
- Vault: remove `credentialAudit` writes, feed and rules.
- [ ] Failing tests: rules deny a Trainee reading `board_docs`; guest key still reads one page; vault entry create/update no longer writes audit.
- [ ] Gate; commit; push; PR.

### Task 12: Page leaning C — contact page, My Day, prayer shortcuts, Global Search (spec §21 cuts, §24, §25, §27) — sonnet, high
- Contact page: remove Full-timers pane (`teamThreads` UI + rules), threads under interactions, the ask part of Delegate (keep add a carer), `ContactReachPrompt`.
- My Day: remove horizon, team numbers, `FirstRunCard`, Questions/BNPB leftovers.
- Prayer: remove to-do and log-interaction shortcuts on cards, mobile `prayer-log`.
- Global Search: keep find-a-person + recent people only (web `GlobalSearch.tsx`, `packages/core/src/search.ts`, mobile).
- [ ] Failing tests: search returns only people; a contact page renders without the Full-timers switch for an `admin`.
- [ ] Gate; commit; push; PR.

---

## Phase 2 — Builds

### Task 13: Notification rule (spec §28) — opus, medium
**Files:** `src/lib/threads.ts`, `packages/core/src/data/threads.ts`, `src/hooks/useContactStory.ts`, `NewContactModal.tsx`, `LogInteractionModal.tsx`, `packages/core/src/data/contacts.ts`, `src/views/SignUp.tsx` + `packages/core/src/data/signup.ts`, `NotificationCenter.tsx`.
- Sends only: @mention (+reminder), announcement, to-do assigned/due, report outcome, sign-up (Full-timers only). Remove bell filters.
- [ ] Failing tests: posting a conversation message without a mention sends nothing; with a mention sends to the mentioned only; logging an interaction sends nothing; creating a contact sends nothing; a sign-up notifies only `admin` users.
- [ ] Gate; commit; push; PR.

### Task 14: Team prayer per person (spec §21) — opus, high
**Interfaces:** contact field `teamPrayer: boolean`. `isOnTeamPrayer(contact): boolean`. `setTeamPrayer(contactId, on: boolean)` (replaces per-prayer toggle; `on` also clears `prayerListRemoved`). On our hearts shows every prayer of a contact with `teamPrayer`.
- [ ] Failing tests: two prayers for one on-team contact both appear; an off-team contact's prayers do not; rules allow `teamPrayer` on the contacts update branch within the expression budget (rules test).
- [ ] Migration script `scripts/migrate-team-prayer-per-person.ts` (dry run default): contact `teamPrayer = true` if any prayer is team and the contact is not `prayerListRemoved`. Not run; post-merge step.
- [ ] Update the prayer seam guard spec; gate; commit; push; PR.

### Task 15: Moving up banner and high school years (spec §13) — sonnet, medium
**Files:** `src/lib/contactYear.ts` (`YEARS`), `packages/core/src/signup.ts` (`SIGNUP_YEARS`), `src/lib/movingUpAYear.ts`, `MovingUpAYearModal.tsx`, `Directory.tsx`, rules year-confirm branch.
- `YEARS = ['High school junior', 'High school senior', 'Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other']` in both lists. Next-year map adds `'High school junior' → 'High school senior'`, `'High school senior' → 'Freshman'`.
- Remove `yearConfirmedBy`/`yearConfirmedAt` writes (rules branch accepts writes without them). Banner at top of Directory for `admin` while `yearsToConfirm().length > 0`: "{n} students' years to confirm · Review"; remove the filter-menu button.
- [ ] Failing tests: the two new move-ups; banner hidden at 0 and for `manager`.
- [ ] Gate; commit; push; PR.

### Task 16: Day's goal "show until" (spec §26) — sonnet, medium
- Setting `dayGoalUntil: 'yyyy-MM-dd' | null`; goal shows only while today ≤ that date (local). Settings field "Show the goal until".
- [ ] Failing tests: shown on the until-date, hidden the day after, hidden when null.
- [ ] Gate; commit; push; PR.

### Task 17: Impersonation check (spec §28) — opus, high
- [ ] Extend `e2e/journeys/impersonation.spec.ts`: a Full-timer viewing as a Trainee sees exactly that Trainee's Directory count and none of a seeded out-of-scope contact; writes while impersonating are attributed per the existing rule. Fix anything that fails. Run it.
- [ ] Gate; commit; push; PR.

### Task 18: Quick add — parse and in-app flow (spec §26) — opus, high
**Interfaces:** server `POST /api/quick-add/parse` `{ text } → { contact: Partial<Contact>, match: { id, name }[] , interaction?: { type, when, notes }, prayer?: string, reminder?: { when, text } }` (reuses the Smart Import parse code and auth). Mobile route `apps/mobile/app/quick-add.tsx`; web modal from the same core types.
- Preview card shows every parsed field, editable; Save writes contact (or picks a matched one), interaction, prayer, reminder in one batch. Zero or several matches → user picks; nothing saves without Save.
- Long-press app icon shortcut "Quick add" (iOS + Android) via an Expo quick-actions config plugin opening `quick-add`.
- [ ] Failing tests: parse of "Met Jordan at the club table, sophomore, wants Bible study, pray for his exams" maps each field; no-name text returns no contact and the UI blocks Save; two matching contacts returns both and none is preselected.
- [ ] Gate (web + mobile tsc); commit; push; PR.

### Task 19: Home screen widgets (spec §26) — opus, xhigh
- iOS widget (WidgetKit, via config plugin) and Android widget, each a single "Quick add" button deep-linking to `quick-add`. No text input in the widget.
- [ ] Verify with a dev build on the iOS simulator and Tony's Pixel (adb); one screenshot each of the final state.
- [ ] Commit; push; PR.

### Task 20: Final branch review — opus, high
- [ ] One fresh reviewer reads the whole stack against the spec and lists gaps; fix in the owning task's branch.

## Post-merge steps for Tony (not agent-run)
- Run `scripts/downgrade-legacy-roles.ts --commit` and `scripts/migrate-team-prayer-per-person.ts --commit`.
- File the BNPB ticket (text in Task 4's PR).
- Deploy rules and indexes from the merged branch.
- Ask the other Full-timers about Around the Team (spec §6).
