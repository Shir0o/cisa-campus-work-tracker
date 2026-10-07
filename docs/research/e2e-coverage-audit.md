# E2E coverage audit: features since 2026-08-17 and their escapes

Research for [Audit coverage: features since 8-17 and escapes, compared against existing specs](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1460), part of the map [Wayfinder: e2e that actually catches regressions](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1457). Written 2026-10-06 against `main` at `3a5ddad2`.

**Question.** Which user stories shipped since the last green web e2e run (2026-08-17) have no Playwright coverage, and which of them actually broke?

**Short answer.**

- **32 escapes.** Shipping one feature broke another, or broke on a layer the feature shares with others.
- **31 of the 32 had no spec that asserts the broken behaviour.** The one that did, the trainee Journey board, passed in the emulator while production was broken.
- So the suite being red was not the main reason escapes got through. **Coverage was.**
- **189 of 215 feature PRs have no spec at all.** That is about 600 of the 730 user stories in the issues they closed, or about 800 of roughly 930 once the parent PRDs are counted.
- 8 more feature PRs have a spec that was red at the time.

## Sources and method

All claims cite their primary source, which is one of:

- the `main` git history, with `git log`, `git blame` and pickaxe (`git log -S` / `-G`);
- PR bodies and the issues they close (`gh pr list --state merged --search "merged:>=2026-08-17"`, `closingIssuesReferences`);
- issue bodies and triage comments (`gh issue view --comments`);
- the nightly `Web E2E (Playwright)` workflow logs (`gh run list --workflow e2e.yml`, `gh run view --log-failed`) for every scheduled run from 8-17 to 10-06;
- the spec files in `e2e/*.spec.ts` at `3a5ddad2`.

Notes on the method:

- **Commit count.** There are **620 commits** on `main` since 2026-08-17, not ~415. The ~415 figure comes from a shallow clone whose history starts on 8-29. The 8-17 to 8-28 window adds about 200 commits, mostly the Spanish i18n sweep and the feedback round-ups.
- **Feature PR.** A commit typed `feat` (or an equivalent untyped feature commit such as "Vertical rail replaces top bar"), giving **215 feature PRs**. Fix commits were read to find escapes, not counted as stories.
- **Coverage is judged per feature, not per story line.** A feature counts as covered when a spec tags its issue as `(#NNN)` or plainly exercises its main story. It counts as *partial* when a spec visits the surface but does not assert the story.
- **User stories** are the `As a …` lines in the issues a PR closes. Sub-issues of a PRD carry none of their own. Their stories live in the parent, which adds 202 more stories:
  - "Every written stream in one Slack-style grammar" (#1255): 62 stories.
  - "Contact page as a story beside a conversation, Not reached yet…" (#1284): 83 stories.
  - Three Bible-study specs (#856, #857, #879): 57 stories.
- **Escape.** A `bug` or `feedback` issue (272 opened since 8-17; about 130 of them "off"/bug reports) where a shipped feature broke a different feature or flow, or a feature broke at ship because of a shared layer: rules, indexes, data shape, the nav shell or i18n keys. These do *not* count as escapes:
  - pure design feedback;
  - Bible-study editor churn inside the same feature;
  - infra and config (the Android FCM IAM grant, the TOTP provider toggle, the shared calendar's cross-project auth);
  - flakes.
  Fix commits with no bug issue (for example #955, #1355, #1359) are included when their body states what broke.
- **Breaking PR.** Marked *stated* when the fix PR or triage comment names the cause, *pickaxe* when found with `git log -S`/`-G`/`blame`, and *inferred* when it rests on merge date and symptom only.

## The nightly suite, 8-17 to 10-06

Source: logs of all 51 scheduled runs of `e2e.yml` on `main`.

| Nights | State | What failed |
|---|---|---|
| 8-17 | **green** (last) | none |
| 8-18 to 8-23 | 1 to 5 failed | `outreach-signup:24` (sign-up form changed shape, `#signup-major` no longer a select). `permissions:104` on 8-20 and 8-21. |
| 8-24 to 8-26 | failed | Logs have expired. |
| 8-27, 8-28 | 32 of 36 failed | Every test timed out waiting for the `Main Navigation` landmark. |
| 8-29 | 2 failed | `asks-questions-for-team:71`, `outreach-signup:24` |
| 8-30, 8-31 | crashed before tests | The seed script broke on the firebase-admin v14 API (fixed by #691). |
| 9-01 to 9-21 | 1 to 7 failed every night | See "Specs that stayed red" below. |
| 9-22 to 9-26 | crashed before tests | The functions emulator and seed could not load `@google-cloud/firestore`. |
| 9-27 to 9-29 | crashed before tests | The Playwright `webServer` died on `VITE_FIREBASE_API_KEY`. #1233 (GroupMe creator attribution) pulled the client Firebase module into `server.ts`. Fixed by #1248. |
| 9-30 | ran: 86 passed, 3 failed, 5 did not run | `quick-capture:86`, `the-journey-board:174`, `walking-together-threads:7` |
| 10-01 to 10-06 | crashed before tests | `firebase-applet-config.json needs an import attribute of "type: json"`, raised after the seed creates users |

The map's notes put the start of the JSON-import crash at #1229 (Node 24, 9-26). The logs say otherwise: 9-26 failed on the missing module, 9-27 to 9-29 on the `webServer`, and 9-30 ran in full. The JSON-import crash first appears on 10-01.

"Fix the e2e suite: repair the web Playwright suite (84/84 green)" (#1155) merged on 9-21, after that night's run. No nightly run after it was green. The next full run (9-30) had 3 failures.

**Specs that stayed red.** These are the ones relevant to coverage below. Several use `mode: 'serial'`, so one red test marks the rest of the file "did not run".

- `mobile-and-pwa-contact-editing:28`: red on every run from 9-02 to 9-21. It never passed a nightly run after its own PR (#736).
- `walking-together-threads:7`: red on every run from 9-06 to 9-30. The follow-up tab was renamed, and later the `Full-timers` button went missing. Its trainee test (`:61`, which checks that Full-timers-only discussion stays hidden) did not run on any of those nights.
- `announcements-flow:95`: red on 11 runs from 9-07 to 9-21 (strict-mode clash on a duplicated message). `announcements-flow:22` was red on 9-03 and 9-05.
- `notification-bell-deep-linking:7`: red on 9-02, 9-12, 9-14, 9-17, 9-20 and 9-21. From 9-12 on, the cause is a strict-mode clash between `getByText('First Contact')` and the "Move to a step: First Contact" button that #825 added. Stories 2 to 5 were skipped on those nights.
- `settings-and-partners:6`: red from 9-01 to 9-03 (no level-1 heading) and from 9-16 to 9-21. In the second stretch the text "Partners this term" was not found. Its first night follows the dated pairing model (#1078 to #1080), which is the likely cause (inferred).
- `cross-role-journey:73`: red on 9-20 and 9-21. `quick-capture:159`: red on 9-20.

**Specs the nightly run did catch.** These were fixed on 9-04 and 9-05; it is the one time a red nightly was acted on. They were drift in the specs, not product regressions:

- "E2E: contact Edit details button moved into the More actions menu" (#832), broken by #783.
- "E2E: mobile-viewport spec times out on /support" (#833), broken by #807.
- "E2E: admin Settings page has no level-1 heading" (#834).
- "E2E: mobile contact-editing spec fills a hidden last-name field" (#835).
- "E2E: announcements wizard spec waits on a placeholder that no longer exists" (#836).

## Ranked gap table, part 1: escapes

Ranked by blast radius: people locked out of data or seeing data they shouldn't come first, then data loss, then broken flows, then cosmetic. "Spec at the time" answers whether an existing spec asserts the broken behaviour, and if so whether it was red.

| # | Escape (issue) | Breaking PR | Fix | Seam | Spec at the time |
|---|---|---|---|---|---|
| 1 | Trainees can't see contacts on the phone: "Couldn't get touches" (#1411, #1412, open) | #1219 scoped interactions and comments reads to visibility. Phone People still calls `subscribeTouches` with no scope (`apps/mobile/src/lib/usePeopleData.ts:52`). *Inferred from code.* | open | Rules ↔ query scope | **Uncovered.** Native app; Playwright can't reach it. |
| 2 | The Journey does not load for trainees on the web (#1218) | #1036 enforces the tie in rules; `OutreachBoard`'s contacts query was unscoped. *Stated cause + blame.* | #1224 | Rules ↔ query scope | **Covered, green, still missed.** `the-journey-board:119` and `cross-role-journey:114` assert that a trainee sees the board. Both passed in the emulator after #1036 (9-15, 9-21). On the report date (9-26) the suite was crashing. Why the emulator didn't reproduce it is unexplained. |
| 3 | Messages and Questions for the team broken for staff; "can't add someone else to contact" (#564, #589, #591) | The live asks subscription read the whole collection, which the rules deny. It came with the Ask the team / questions channel PRs (#548, #568). *Stated cause, breaking PR inferred.* | #601 | Rules ↔ query scope | **Uncovered at the time.** The asks spec was written afterwards by #604. The suite was 32/36 red on 8-27 and 8-28. |
| 4 | Questions channel permission-denied under "See as their view" (#603) | #568 × impersonation: `effectiveUserId` was the persona id. *Stated.* | #604 | Impersonation identity | **Uncovered.** The fix added `asks-questions-for-team` stories 1 and 2. |
| 5 | Full-timers-only posts leak onto the trainee phone home (#951, security) | Team-scope thread posts × `@cisa/core` `buildQueue` / `traineeWaitingItems`, which ignored `scope`. *Stated cause; no PR named.* | #952 | Visibility / feed scoping | **Uncovered on the phone.** The web analogue (`walking-together-threads:61`) did not run from 9-06 on, because test 1 was red in serial mode. |
| 6 | Trainee phone home shows cards for people not in their care (#1087) | Founders/pair widening of `visibleTo` (#1044: #1079, #1084) × the queue's `byId` filter. Partial earlier fix #1006. *Stated.* | #1099 | Visibility / feed scoping | **Uncovered** (native) |
| 7 | "See as their view" still shows people the trainee can't see, and the owner's own name (#559, #679) | The merged attention feed (#394) and Directory weren't scoped to `effectiveUserId`. *Stated cause, PR inferred.* | #596, #723 | Impersonation identity | **Partial.** `impersonation-personas` checks only nav items. |
| 8 | Switching to a teammate's view crashes the contact page: React #300 (#791) | Early return before hooks in `ContactDetailsModal` (#250), reached once impersonation removes access. *Pickaxe.* | #792 | Impersonation × contact page | **Uncovered** |
| 9 | People appear on On our hearts without being added (#1042, then again in #1406, open) | Prayers written on the contact Prayer tab, in Log a visit and on the phone Pray sheet omit `teamPrayer: false`, and `isTeamPrayer` reads a missing flag as team. #599 (#565) made those paths un-hide the person too. *Stated.* | #1062 (contact tab only); #1406 / #1418 open | Prayer team flag | **Partial.** `prayer-carrying` only loads the pages. |
| 10 | Combine contacts crashes: `createdAt.slice is not a function` (#1130) | Combine (#1100, 9-17) assumed string `createdAt`; sign-ups store a Timestamp. *Stated cause, PR inferred.* The same seam broke again in the year move-up (#1356), fixed by #1357. | #1132, #1357 | Contact `createdAt` mixed type | **Uncovered** |
| 11 | Public sign-ups never appear in Around the team or My Day (#1071) | Ties denormalised into `visibleTo` (#1035, #1036); unauthenticated sign-ups write no ties, so the feeds skip them. *Stated.* | #1094 | Visibility / ties | **Partial.** `outreach-signup:24` submits the form but never looks at the feed. |
| 12 | The team toggle in Around the team shows nothing (#1163) | The roster's `users` `onSnapshot` had no error handler, so one permission-denied emptied it for the session. *Stated cause; breaking PR not found.* | #1164 | Users roster read | **Uncovered** |
| 13 | Phone edits to How we met and Address silently dropped, 9-02 to 10-04 | #740, a "Design canvas" PR, removed `metVia` and `location` from the phone's `updateContact`. *Pickaxe (diff).* | #1355 | Unrelated PR clobbering | **Uncovered** (native) |
| 14 | A raw key shows as a field name on the phone contact page (#1415, open) | #740 also deleted `mobile.contact.how_we_met` from the phone `en.json`. `EditContactSheet.tsx` still uses it, and it is missing on `main` today. *Pickaxe + key check.* | open | i18n keys; unrelated PR clobbering | **Uncovered** (native) |
| 15 | A notification about a reply opens the stream, not its Thread (#1303) | The stream rework (ADR 0033: #1266, #1272) moved replies into Threads; notification links didn't follow. *Stated.* | #1333 | Notification link targets | **Partial.** `notification-bell-deep-linking` covers routes, not message → Thread. It passed on 9-30. |
| 16 | Web Push fails for long messages: payload over 4096 bytes (#1440, open) | #1177 pushes every bell entry with the full message as the body. *Stated cause, PR inferred.* | open | Push transport | **Partial.** `push-notifications` checks bell → device, but the emulator push sink has no size limit. |
| 17 | Contact owner transfer throws "Missing or insufficient permissions" (#802) | Transfer shipped (#685, `ed792825`); rules required an `owner` field that older docs lack. *Stated cause, PR inferred.* | #810 | Rules ↔ legacy data shape | **Uncovered** |
| 18 | Turning on the BFA intake flag in Settings is denied | #1065 (BFA intake) writes `bfa` to season settings; the rules' `hasOnly` rejected the key. *Stated.* | #1113 | Rules ↔ new field | **Uncovered**; `settings-and-partners` was red 9-16 to 9-21 anyway |
| 19 | Add to story refused for everyone, Full-timers included | #1328 shipped writing `storyMessageIds` with no rules branch. *Stated.* | #1359 | Rules ↔ new field | **Uncovered** (suite crashing) |
| 20 | Updating a contact with no email is denied | `isValidContact` required an email; sign-up and quick-add contacts carry `null`. *Stated cause; breaking PR not found.* | #1251 | Rules ↔ legacy data shape | **Uncovered** |
| 21 | Web thread subscription errors (#964) | The all-threads `collectionGroup('threads')` query from #798 had no index. Rules and index deploys were blocked 8-29 to 9-07 (#868). *Stated + pickaxe.* | #985 | Firestore indexes | **Uncovered**; the emulator doesn't enforce indexes |
| 22 | Around the team missing on the phone and PWA (#841) | The On You / Around split (#623) gated Around on `!isSingleColumn`. *Stated cause, PR inferred.* | #850 | Around / My Day composition | **Partial.** `mobile-viewport` checks overflow only. |
| 23 | Around rows read "Contact" and won't open; My Day loses its 2-column grid | #945 (Around becomes its own destination). *Stated in #955.* | #954, #955 | Around / My Day composition | **Uncovered** |
| 24 | The to-work-through count differs between the weekly reminder, the My Day card and Around (#1336, #1339) | Weekly reminders (#1318) and the My Day pointer card (#1317) each read a different model from Around. *Stated.* | #1338, #1384 | To-work-through count | **Uncovered** |
| 25 | Full-timers see reached people as Not reached yet (#1335) | The reach model (#1309) reused the team's 500-newest-interactions read. *Stated.* | #1337 | Capped interactions read | **Uncovered** |
| 26 | Open dialogs close when the window crosses 1024px (#1129) | The rail/top-bar shell switch (#672) remounts `<main>`. *Stated cause, PR inferred.* | #1134 | Nav shell | **Uncovered** |
| 27 | The sign-up form link disappeared from the sidebar (#676) | The vertical rail (#672) dropped the old More-menu entry. *Stated cause, PR inferred.* | #718 | Nav shell | **Partial.** `permissions` lists nav items per role but not Sign-up form. |
| 28 | Odd gap above Sign-up form in the rail (#747), then a stray comment rendered as text | #718 gave the new item group padding; the fix #781 left a JS comment in JSX. *Stated.* | #781, #789 | Nav shell | **Uncovered** (visual) |
| 29 | My Day text invisible in dark mode (#683); dropdown arrows sit outside selects (#750) | The Ink design system (#671, 8-30). *Inferred by timing.* | `2e1a676`, #830 | Design tokens | **Uncovered** (visual) |
| 30 | Raw i18n keys on screen: `modals.select_background` (#767), `modals.saving` (#1237), `history.all` (#1236), two contact-aside keys | #469 (i18n sweep) referenced keys that don't exist (#767, #1237; *pickaxe*). The "Cared for by" transfer rename (#685) dropped keys (*stated*, `f6c8370e`). #1236 not traced. | #769, #1245, #1247, `f6c8370e` | i18n keys | **Uncovered** |
| 31 | Test-account purge misses interactions logged by test accounts (#1127) | Quick-add and webhook interactions store only `createdById`; the purge (#799) read `userId`. *Stated.* | #1133 | Interaction author field | **Uncovered** |
| 32 | The dev server and the e2e `webServer` crash on boot (9-27 to 9-29) | #1233 imported the client Firebase module into `server.ts`. *Stated.* | #1248 | Server import graph | Took the whole e2e suite down for three nights |

Five of the 32 are entirely in the phone app (rows 1, 5, 6, 13, 14), and two more have a phone half (row 9's Pray sheet, and row 16, since Expo has the same 4096-byte limit). The web Playwright suite cannot reach them; they belong to the Maestro branch the map leaves open.

## Ranked gap table, part 2: uncovered stories by feature area

Areas are ranked by escapes in the area × story volume × how cheaply a spec can assert the story. Per-PR detail is in the appendix.

| Area | Feature PRs | Issues closed | User stories in those issues | Covered | Partial | Covered but spec red | Uncovered |
|---|---|---|---|---|---|---|---|
| Contact page | 29 | 30 | 153 (+83 in PRD #1284) | 1 | 0 | 2 | 26 |
| Directory (People) | 24 | 24 | 34 | 0 | 0 | 1 | 23 |
| Around the team & My Day | 24 | 29 | 136 | 0 | 2 | 0 | 22 |
| Bible study | 21 | 25 | 132 (+57 in PRDs #856, #857, #879) | 0 | 0 | 0 | 21 |
| Streams & messages | 20 | 20 | 45 (+62 in PRD #1255) | 0 | 5 | 4 | 11 |
| i18n | 16 | 17 | 0 | 0 | 0 | 0 | 16 |
| Nav, shell & design system | 11 | 7 | 0 | 0 | 2 | 0 | 9 |
| Settings, auth & security | 10 | 7 | 0 | 0 | 0 | 0 | 10 |
| Help & What's New | 9 | 8 | 17 | 2 | 1 | 0 | 6 |
| Mobile native & release | 8 | 5 | 25 | 1 | 0 | 1 | 6 |
| Gatherings & attendance | 7 | 6 | 113 | 0 | 0 | 0 | 7 |
| Questions for the team | 7 | 6 | 13 | 4 | 0 | 0 | 3 |
| Prayer (On our hearts) | 6 | 6 | 0 | 0 | 0 | 0 | 6 |
| Notifications & push | 5 | 5 | 0 | 0 | 0 | 0 | 5 |
| Coordination docs | 5 | 2 | 22 | 0 | 0 | 0 | 5 |
| Partners & pairing | 5 | 5 | 0 | 0 | 0 | 0 | 5 |
| Rules & data layer | 4 | 4 | 40 | 0 | 0 | 0 | 4 |
| Sign-up & outreach | 3 | 2 | 0 | 0 | 0 | 0 | 3 |
| Calendar | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| **Total** | **215** | **208** | **730 (+202 in PRDs)** | **8** | **10** | **8** | **189** |

The 182 issues behind uncovered PRs hold 598 of the 730 stories. Add the uncovered PRDs (contact page, Bible study and most of the stream grammar) and roughly 800 of about 930 stories have no spec.

Uncovered stories by area, in priority order:

1. **Contact page, visibility and reach.**
   - Escapes: rows 1, 2, 6, 10, 11, 17, 19, 20, 25.
   - Uncovered stories:
     - Trainee sees exactly their tied people, with Directory, Journey and People rows agreeing.
     - A public sign-up shows up for Full-timers.
     - Kinds: Local saints, Our own, Contacts (#1206).
     - The story and conversation page (#1284 slice: #1309, #1323 to #1334).
     - Add to story.
     - Log on a teammate's behalf.
     - Delegate and Share.
     - Year and major, and the August move-up.
     - Founders and carers ties (#1079 to #1086).
   - The only contact-page specs (`walking-together-threads`, the stage move in `the-journey-board:174`) were red at the time.
2. **Around the team and My Day.**
   - Escapes: rows 7, 12, 22, 23, 24.
   - Uncovered stories:
     - Around as its own destination (#945).
     - Worklist with Reviewed / To work through (#1019).
     - Team and teammate filter (#806).
     - Call and email affordances (#851).
     - The Not reached yet card (#1317).
     - A count that agrees everywhere.
     - "See as their view" scoping the feed.
3. **Streams, messages and notifications.**
   - Escapes: rows 3, 5, 15, 16, 21.
   - Partly covered by `announcements-flow`, `walking-together-threads`, `notification-bell-deep-linking` and `push-notifications`. All but the last were red for most of September.
   - Uncovered stories:
     - DMs and groups (#1274).
     - Edit or delete your own message (#1307, #1138).
     - @mention picker (#798, beyond the push test).
     - Make a to-do from a message (#1327).
     - Notification → Thread (#1303).
     - Full-timers-only posts never reaching trainees.
     - Weekly reminders (#1318) and unanswered-ask reminders (#1312).
4. **Prayer (On our hearts).**
   - Escape row 9, which recurred.
   - All six feature PRs are uncovered: remove with undo (#788), archive reason (#779), clear (#778), cared-for-by header (#745), stale contacts (#602).
   - Uncovered story: only people added on `/prayer` appear there.
5. **Directory (People).**
   - Escape row 10.
   - Uncovered stories:
     - Combine contacts, plus the dry run and subcollection migration (#1100, #1172, #1181).
     - Combine tags (#1390).
     - Kind segments and Not reached yet filter (#1315, #1316).
     - Search by founder or carer and word-boundary search (#1180, #1211).
     - Bulk stage and bulk emails (#385, #759).
     - Filters retained on back (#1091).
6. **Settings, auth and impersonation.**
   - Escapes: rows 4, 7, 8, 18, 26.
   - Uncovered stories: TOTP MFA (#1146), App Check (#1145), access-restricted screen for uninvited users, test-account purge (#799), attd sync token (#1235), display names (#815).
   - Impersonation is covered for nav only.
7. **i18n.**
   - Escapes: rows 14 and 30, about five raw-key escapes in total.
   - 16 PRs, no spec. The cheapest high-value check is that no route renders a string shaped like an i18n key, in either language.
8. **Nav, shell and design system.**
   - Escapes: rows 26 to 29.
   - Mostly visual. Assertable parts: the nav item set per role (including Sign-up form and Your notes) and state surviving the 1024px shell switch.
9. **Gatherings and attendance.**
   - No escapes found.
   - 113 stories behind 7 PRs: roster and walk-ins (#771), a Gathering nobody came to (#797), attendance on the Gathering (#1027), attd sync review (#1033), Homes / Who we haven't seen (#1210), Came / We missed (#1388).
   - The spec only loads `/attendance`.
10. **Bible study.**
    - 21 PRs and about 189 stories, all uncovered.
    - Its regressions (toolbar click jumping to the top, Verse inserting at the section end) stayed inside the editor, so none are escapes here.
    - The public reader is its own surface.
11. **Coordination docs.** Guest links and QR (#1026, #1149), plus a long doc freezing the tab (#1371). Uncovered.
12. **Questions for the team, and Help & What's New.** Mostly covered. Uncovered: delete a question or reply (#651, #693), the `/help` route (#1385 to #1389).

## Recurring cross-feature seams

Each of these shared components or data paths broke more than once:

1. **Firestore rules vs. client queries and writes (9 escapes).**
   - Escapes: rows 1, 2, 3, 17, 18, 19, 20, plus the index miss in row 21 and the role-simulation id in row 4.
   - A rules change lands without its call sites (#1036 → Journey board; #1219 → phone People). Or a client feature writes a key or runs a query the rules don't allow (#548/#568, #685, #1065, #1328).
   - The rules unit suite passes in each case, because the bug sits between the rules and the client's actual query.
2. **Visibility, ties and feed scoping, `visibleTo` (5).**
   - Escapes: rows 1, 2, 5, 6, 11.
   - Too little (sign-ups invisible, trainees locked out) and too much (cards and Full-timers-only posts leaking) both trace to the #1024 phase 4 / #1044 tie model meeting older feeds.
3. **Impersonation, "See as their view" (4).**
   - Escapes: rows 4, 7, 8, plus the mobile `QueueScreen` hook-order crash fixed in #1006.
   - Each new surface had to opt into `effectiveUserId`, and several didn't.
4. **Contact data shape (5).**
   - Escapes: rows 10, 17, 20, 31, plus the year move-up repeat (#1357).
   - Mixed `createdAt` (string or Timestamp), a missing `owner`, a `null` email, and the interaction author in `userId` or `createdById`. Seed data in the emulator is uniform, which is likely why specs pass where production fails (compare row 2).
5. **i18n keys (5).**
   - Escapes: row 30 (four keys) and row 14.
   - Keys referenced but never added (#469), or deleted by an unrelated PR (#740, #685's rename).
6. **Nav shell and rail (5).**
   - Escapes: rows 26, 27 and 28 (twice), and the dark-mode states in row 29.
   - The vertical rail (#672 / #673) and its follow-ups.
7. **The prayer team flag on On our hearts (2, still open).**
   - Escapes: #1042, then #1406.
   - The flag is a missing-means-team default with several writers. The #565 fix (#599) pulled the other way.
8. **Around / My Day read model and composition (4).**
   - Escapes: rows 22, 23, 24, 25.
   - Every restructure (#623, #945, #1317, #1318, #1309) re-derived "who needs attention" separately.
9. **Notification targets and transport (3).**
   - Escapes: row 15, row 16, and the original bell routing (#682).
   - Links and payloads are built in each feature, so a rework of where content lives (the stream grammar) silently stales them.
10. **Unrelated PRs clobbering shared files (3).**
    - Escapes: rows 13 and 14 (#740 is a design-canvas PR that edited phone data code and locale files), plus #783 deleting CSS its own markup used (fixed in #793).

## Caveats

- Breaking PRs marked *inferred* rest on merge date and symptom. Row 2's emulator pass after #1036 is unexplained and worth a look before trusting `the-journey-board:119` as a guard.
- Run logs for 8-24 to 8-26 have expired.
- Story counts come from `As a …` lines, so they undercount issues that use acceptance-criteria checklists instead.
- The area grouping is by commit scope and keywords. A few PRs sit on a boundary; for example, gospel partners #567 is under Directory.

## Appendix: every feature PR since 8-17 and its coverage

"Stories" counts the `As a …` lines in the issues the PR closes. Blank means the stories live in a parent PRD or the issue uses another format.

### Contact page

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-04 | [#1356](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1356) moving up a year each August | #1351 | 14 | **uncovered** |
| 10-04 | [#1354](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1354) edit year and major; year tags move into year | #1348 |  | **uncovered** |
| 10-03 | [#1334](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1334) text-first story composer | #1292 |  | **uncovered** |
| 10-03 | [#1332](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1332) conversation pane, and the tabs retired | #1290 |  | covered, spec red: walking-together-threads; red, suite crashed |
| 10-02 | [#1328](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1328) Add to story from a Conversation message | #1298 |  | **uncovered** |
| 10-02 | [#1326](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1326) head kind chip, About sheet, Delegate and Share | #1299 |  | **uncovered** |
| 10-02 | [#1325](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1325) prompt to log a reach after Text or Call | #1297 |  | **uncovered** |
| 10-02 | [#1324](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1324) log an interaction on a teammate's behalf | #1288 |  | **uncovered** |
| 10-02 | [#1323](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1323) the story holds changes and attendance | #1291 |  | **uncovered** |
| 10-01 | [#1309](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1309) reach model, and rows that say Not reached yet | #1293 |  | **uncovered** |
| 09-25 | [#1222](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1222) desktop contact page tells the person's story (design D) | none |  | **uncovered** |
| 09-24 | [#1206](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1206) tell Local saints, Our own and Contacts apart | #1152 | 42 | **uncovered** |
| 09-16 | [#1084](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1084) founders are co-equal and the current-term widening retires | #1054 |  | **uncovered** |
| 09-16 | [#1083](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1083) remove the contact caregiver field and care transfer | #1053 |  | **uncovered** |
| 09-16 | [#1082](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1082) taking someone into your sheep never grants reach — a carer tie ends with the tie that gra | #1052 |  | **uncovered** |
| 09-15 | [#1081](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1081) cared for by reads who has taken a person on — your sheep becomes a contact tie | #1051 |  | **uncovered** |
| 09-14 | [#1035](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1035) denormalise contact ties into visibleTo, and backfill (#1024 phase 4, part 1/2) | #1024 | 40 | **uncovered** |
| 09-14 | [#1017](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1017) allow co-owners to manage collaborators and fix impersonation bypass | #1013, #1014, #1015, #1016 | 9 | **uncovered** |
| 09-04 | [#825](https://github.com/Shir0o/cisa-campus-work-tracker/pull/825) move a contact's stage from their own page | #677 |  | covered, spec red: the-journey-board:174 (#677); red on 9-30 (strict-mode clash with the story) |
| 09-03 | [#783](https://github.com/Shir0o/cisa-campus-work-tracker/pull/783) give the page back its room | #780 | 25 | **uncovered** |
| 09-01 | [#685](https://github.com/Shir0o/cisa-campus-work-tracker/pull/685) transfer 'Cared for by' ownership from the contact page | none |  | **uncovered** |
| 08-28 | [#652](https://github.com/Shir0o/cisa-campus-work-tracker/pull/652) remove interactions with undo on web + mobile | #650 | 23 | **uncovered** |
| 08-27 | [#624](https://github.com/Shir0o/cisa-campus-work-tracker/pull/624) interactive chip-based tag input in edit modal | #592 |  | **uncovered** |
| 08-25 | [#556](https://github.com/Shir0o/cisa-campus-work-tracker/pull/556) the day's goal — one shared number for an on-campus day | #544 |  | **uncovered** |
| 08-20 | [#418](https://github.com/Shir0o/cisa-campus-work-tracker/pull/418) shared action vocabulary and row menu | #332 |  | covered: cross-role-journey (#631) |
| 08-19 | [#392](https://github.com/Shir0o/cisa-campus-work-tracker/pull/392) audit and derive contact activity fields | #329 |  | **uncovered** |
| 08-19 | [#389](https://github.com/Shir0o/cisa-campus-work-tracker/pull/389) live contact pill with hover preview | #334 |  | **uncovered** |
| 08-19 | [#372](https://github.com/Shir0o/cisa-campus-work-tracker/pull/372) replace residence hall with how we met source | #356 |  | **uncovered** |
| 08-17 | [#339](https://github.com/Shir0o/cisa-campus-work-tracker/pull/339) shared date-bucket util adopted in History | #327 |  | **uncovered** |

### Directory (People)

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-06 | [#1401](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1401) show tag not-reached count as a bare number, hide zeros | #1376 |  | **uncovered** |
| 10-05 | [#1390](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1390) hybrid tag clustering and rule-level confirmation for Combine tags | #1379 | 11 | **uncovered** |
| 10-05 | [#1378](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1378) view and filter contacts by fellowship interests | none |  | **uncovered** |
| 10-01 | [#1316](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1316) Not reached yet filter and tag counts | #1300 |  | **uncovered** |
| 10-01 | [#1315](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1315) kind segments and a chip on every row | #1296 |  | **uncovered** |
| 09-24 | [#1211](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1211) make contact search word-boundary and name-first (closes #1192) | #1192 |  | **uncovered** |
| 09-23 | [#1180](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1180) search contacts by founder, carer, and co-creator | #1176 |  | **uncovered** |
| 09-23 | [#1181](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1181) show field-level merge details in combine contacts preview | none |  | **uncovered** |
| 09-22 | [#1172](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1172) combine contacts individually, fix count label, and migrate subcollections | #1167 | 15 | **uncovered** |
| 09-17 | [#1100](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1100) combine contacts with dry-run preview | #1070 |  | **uncovered** |
| 09-17 | [#1096](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1096) auto-remove the new contact tag after 5 days instead of 7 | #1076 |  | **uncovered** |
| 09-16 | [#1092](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1092) add BFA as a constant tag suggestion | #1068 |  | **uncovered** |
| 09-16 | [#1091](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1091) retain filters when returning from a contact detail | #1067 |  | **uncovered** |
| 09-03 | [#787](https://github.com/Shir0o/cisa-campus-work-tracker/pull/787) add tag gender M/F action with dry run modal | #710 |  | **uncovered** |
| 09-02 | [#759](https://github.com/Shir0o/cisa-campus-work-tracker/pull/759) copy bulk emails and add custom date-range filter | #751 |  | **uncovered** |
| 08-31 | [#689](https://github.com/Shir0o/cisa-campus-work-tracker/pull/689) centred popup replaces the anchored dropdown | none |  | **uncovered** |
| 08-29 | [#654](https://github.com/Shir0o/cisa-campus-work-tracker/pull/654) restyle Global Search (⌘K) to PICKED Bento shell design | #653 | 8 | **uncovered** |
| 08-26 | [#606](https://github.com/Shir0o/cisa-campus-work-tracker/pull/606) add "Interested" & "Open" suggestions and intake tag normalization | #593 |  | **uncovered** |
| 08-26 | [#569](https://github.com/Shir0o/cisa-campus-work-tracker/pull/569) add date filter (today/week/month) and dynamic '#new' tag (#562, #561) | #561, #562 |  | **uncovered** |
| 08-25 | [#567](https://github.com/Shir0o/cisa-campus-work-tracker/pull/567) gospel partners — pair trainees who go out as one, sharing new contacts | none |  | covered, spec red: settings-and-partners (#629); red 9-01 to 9-03 and 9-16 to 9-21 |
| 08-25 | [#555](https://github.com/Shir0o/cisa-campus-work-tracker/pull/555) prayer list roster sorting, gender auto-tag, and UI fixes | none |  | **uncovered** |
| 08-19 | [#387](https://github.com/Shir0o/cisa-campus-work-tracker/pull/387) frecency ranking in Global Search | #328 |  | **uncovered** |
| 08-19 | [#385](https://github.com/Shir0o/cisa-campus-work-tracker/pull/385) bulk stage change in Directory and Prayer list improvements (#344, #345, #347) | #344, #345, #347 |  | **uncovered** |
| 08-19 | [#374](https://github.com/Shir0o/cisa-campus-work-tracker/pull/374) inline contact creation on log a visit & staff login filtering (#369, #366, #367) | #366, #367, #369 |  | **uncovered** |

### Around the team & My Day

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-01 | [#1317](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1317) Not reached yet card | #1287 |  | **uncovered** |
| 09-23 | [#1204](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1204) add skeleton loader and widen container on Your notes page | #1193 |  | **uncovered** |
| 09-18 | [#1125](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1125) allow a note author to edit their own follow-up | #1108 |  | **uncovered** |
| 09-14 | [#1019](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1019) read the conversation in place, and keep one worked-through state | #965, #966, #1012 | 44 | **uncovered** |
| 09-12 | [#984](https://github.com/Shir0o/cisa-campus-work-tracker/pull/984) capture screenshots in-app, show them to admins, never sync to GitHub | none |  | **uncovered** |
| 09-11 | [#979](https://github.com/Shir0o/cisa-campus-work-tracker/pull/979) add canned outcome notifications and reachability badges | #969 | 23 | **uncovered** |
| 09-11 | [#972](https://github.com/Shir0o/cisa-campus-work-tracker/pull/972) reporter labels and no-email issue bodies | #968 | 28 | **uncovered** |
| 09-09 | [#945](https://github.com/Shir0o/cisa-campus-work-tracker/pull/945) Around the team becomes its own destination; My Day is a skim dashboard | #943 | 41 | **uncovered** |
| 09-06 | [#853](https://github.com/Shir0o/cisa-campus-work-tracker/pull/853) shape the Attention Feed from how much there is to show | #823 |  | **uncovered** |
| 09-05 | [#851](https://github.com/Shir0o/cisa-campus-work-tracker/pull/851) call and email reach affordances on Around the team rows | #828 |  | **uncovered** |
| 09-05 | [#846](https://github.com/Shir0o/cisa-campus-work-tracker/pull/846) make the feed a worklist with seen and completed apart | #813 |  | **uncovered** |
| 09-03 | [#806](https://github.com/Shir0o/cisa-campus-work-tracker/pull/806) filter the feed by team and teammate, mark the ones with interactions | #727 |  | **uncovered** |
| 08-29 | [#656](https://github.com/Shir0o/cisa-campus-work-tracker/pull/656) my day points to /questions for answering | #646 |  | partial: asks-questions-for-team story 11 (trainee home) |
| 08-27 | [#623](https://github.com/Shir0o/cisa-campus-work-tracker/pull/623) split desktop attention feed into On You and Around the Team | #595 |  | **uncovered** |
| 08-25 | [#566](https://github.com/Shir0o/cisa-campus-work-tracker/pull/566) release notes sheet, partitioned-browser sign-in fix, and nav-bar queue fix (#546, #557) | #546, #557 |  | partial: impersonation-personas (#557) |
| 08-25 | [#552](https://github.com/Shir0o/cisa-campus-work-tracker/pull/552) Pray together — walk the people on your heart one at a time | #551 |  | **uncovered** |
| 08-22 | [#467](https://github.com/Shir0o/cisa-campus-work-tracker/pull/467) address feedback issues #463 #464 #465 | #463, #464, #465 |  | **uncovered** |
| 08-20 | [#416](https://github.com/Shir0o/cisa-campus-work-tracker/pull/416) add owner-only usage readings for feedback #370 | #370 |  | **uncovered** |
| 08-20 | [#414](https://github.com/Shir0o/cisa-campus-work-tracker/pull/414) address feedback issues #393 #395 #401 #402 | #393, #395, #401, #402 |  | **uncovered** |
| 08-20 | [#394](https://github.com/Shir0o/cisa-campus-work-tracker/pull/394) merge attention surfaces into one feed with a done action | #330 |  | **uncovered** |
| 08-19 | [#390](https://github.com/Shir0o/cisa-campus-work-tracker/pull/390) unify read/done state into one per-user model | #326 |  | **uncovered** |
| 08-18 | [#363](https://github.com/Shir0o/cisa-campus-work-tracker/pull/363) align desktop My Day with Bento 2-column A-Grid and refine typography | none |  | **uncovered** |
| 08-17 | [#336](https://github.com/Shir0o/cisa-campus-work-tracker/pull/336) four new to-do creation entry points | none |  | **uncovered** |
| 08-17 | [#340](https://github.com/Shir0o/cisa-campus-work-tracker/pull/340) central shortcut registry + expanded command palette | #337 |  | **uncovered** |

### Bible study

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-30 | [#1275](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1275) insert multi-verse filler when selecting Verse | none |  | **uncovered** |
| 09-28 | [#1244](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1244) add Key line, retire Passage citation, refresh reader styling | none |  | **uncovered** |
| 09-25 | [#1216](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1216) render bullet list body for prompt card | #1186 |  | **uncovered** |
| 09-23 | [#1188](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1188) verse range with superscripted verse numbers (closes #1187) | #1187 |  | **uncovered** |
| 09-17 | [#1098](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1098) copy a permanent per-week link, not just the latest | #1085 |  | **uncovered** |
| 09-16 | [#1090](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1090) render verse reference in accent color | #1030 |  | **uncovered** |
| 09-09 | [#944](https://github.com/Shir0o/cisa-campus-work-tracker/pull/944) leaving Present mode returns to the week it was launched from | #940 | 12 | **uncovered** |
| 09-09 | [#938](https://github.com/Shir0o/cisa-campus-work-tracker/pull/938) the editor preview themes independently and fills its pane's width | #937 | 15 | **uncovered** |
| 09-08 | [#936](https://github.com/Shir0o/cisa-campus-work-tracker/pull/936) the student sets the type size in the reader | #923 |  | **uncovered** |
| 09-08 | [#934](https://github.com/Shir0o/cisa-campus-work-tracker/pull/934) a Section reads as a card on ground, settling in the panel | #922 |  | **uncovered** |
| 09-08 | [#933](https://github.com/Shir0o/cisa-campus-work-tracker/pull/933) Apply becomes a fourth kind of Prompt | #905, #919 |  | **uncovered** |
| 09-08 | [#932](https://github.com/Shir0o/cisa-campus-work-tracker/pull/932) Verse becomes its own block, with the reference leading | #918 |  | **uncovered** |
| 09-08 | [#902](https://github.com/Shir0o/cisa-campus-work-tracker/pull/902) reader as scrolling deck, editor as document with navigating index | #890 | 36 | **uncovered** |
| 09-08 | [#901](https://github.com/Shir0o/cisa-campus-work-tracker/pull/901) two Full-timers edit one Meeting live, with presence (Tier 1) | #881 |  | **uncovered** |
| 09-08 | [#900](https://github.com/Shir0o/cisa-campus-work-tracker/pull/900) lock the meetings realtime path behind sign-in | #883 |  | **uncovered** |
| 09-07 | [#899](https://github.com/Shir0o/cisa-campus-work-tracker/pull/899) the Meeting editor saves by itself (Tier 0 autosave) | #880 |  | **uncovered** |
| 09-07 | [#887](https://github.com/Shir0o/cisa-campus-work-tracker/pull/887) ⌘S/Ctrl+S saves the meeting instead of the browser page | none |  | **uncovered** |
| 09-07 | [#885](https://github.com/Shir0o/cisa-campus-work-tracker/pull/885) Meetings render rich markdown and read as written (ADR 0013) | #876 | 28 | **uncovered** |
| 09-07 | [#871](https://github.com/Shir0o/cisa-campus-work-tracker/pull/871) start a study from the app, not a service-account key | #822 |  | **uncovered** |
| 09-06 | [#865](https://github.com/Shir0o/cisa-campus-work-tracker/pull/865) durable Entry points, weeks index, reader states, present mode | #822, #858, #859, #860, #861, #862, #863, #864 |  | **uncovered** |
| 09-03 | [#805](https://github.com/Shir0o/cisa-campus-work-tracker/pull/805) implement public reader and admin editor for QR-reachable Bible studies | #774 | 41 | **uncovered** |

### Streams & messages

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-02 | [#1327](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1327) tick checklist, drop dead CSS and keys, parity, Make a to-do | #1304 |  | **uncovered** |
| 09-30 | [#1307](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1307) edit your own Conversation message, web and phone | #1280 |  | **uncovered** |
| 09-30 | [#1294](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1294) phone chat audience headers, hidden-message decision, left-aligned skeleton | #1279 |  | **uncovered** |
| 09-30 | [#1285](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1285) phone composer — @mention picker and chat attachments | #1278 |  | **uncovered** |
| 09-30 | [#1283](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1283) phone announcements read on view, with the poster's receipts | #1277 |  | **uncovered** |
| 09-30 | [#1276](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1276) phone chat and announcements | #1262 |  | **uncovered** |
| 09-30 | [#1274](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1274) messages — DMs, groups and announcements | #1259 |  | partial: announcements-flow (edited in the PR); suite crashed from 10-01 |
| 09-30 | [#1273](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1273) phone person screen — Conversation, Full-timers switch, Story Threads | #1261 |  | **uncovered** |
| 09-30 | [#1272](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1272) Full-timers, Interaction Threads and the Around strip | #1258 |  | covered, spec red: walking-together-threads (Full-timers switch); red on 9-30 |
| 09-29 | [#1271](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1271) Your notes — Follow-ups as rows | #1260 |  | **uncovered** |
| 09-29 | [#1266](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1266) the Conversation drawer in the one stream grammar | #1257 |  | covered, spec red: walking-together-threads; red |
| 09-19 | [#1141](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1141) remove emoji reactions everywhere, keep heart-only encourage | #1107 |  | partial: announcements-flow (heart-only) |
| 09-18 | [#1138](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1138) delete a single conversation thread message (author or admin) | #1126 |  | **uncovered** |
| 09-04 | [#844](https://github.com/Shir0o/cisa-campus-work-tracker/pull/844) let a Full-timer ask a Trainee about a contact, and make it land | #813 |  | partial: push-notifications question test (added 9-22) |
| 09-04 | [#820](https://github.com/Shir0o/cisa-campus-work-tracker/pull/820) simplify thread reactions to single heart reaction | #819 |  | **uncovered** |
| 09-03 | [#798](https://github.com/Shir0o/cisa-campus-work-tracker/pull/798) add @ mentions and stakeholder notifications | #790 |  | partial: push-notifications @mention test (added 9-22) |
| 09-02 | [#749](https://github.com/Shir0o/cisa-campus-work-tracker/pull/749) rework UI/UX of announcements | #743 | 45 | covered, spec red: announcements-flow (#743); red 9-03, 9-05, and test 2 red on 11 runs 9-07 to 9-21 |
| 08-26 | [#568](https://github.com/Shir0o/cisa-campus-work-tracker/pull/568) add questions for the team channel and Slack-style threads | #563 |  | partial: asks-questions-for-team (channel later moved to /questions) |
| 08-20 | [#424](https://github.com/Shir0o/cisa-campus-work-tracker/pull/424) one conversation thread per person and retire admin comments | #333 |  | covered, spec red: walking-together-threads (#630); test 1 red every run 9-06 to 9-30 |
| 08-20 | [#417](https://github.com/Shir0o/cisa-campus-work-tracker/pull/417) add admin walking-together pairing picker | #358 |  | **uncovered** |

### i18n

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-23 | [#1190](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1190) add scheduled background translation cron | #1168 |  | **uncovered** |
| 09-17 | [#1111](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1111) show already-Spanish content as-is, en→es only | #1043 |  | **uncovered** |
| 08-24 | [#547](https://github.com/Shir0o/cisa-campus-work-tracker/pull/547) translate board docs per h1 section to reuse cached sections on edits | none |  | **uncovered** |
| 08-24 | [#543](https://github.com/Shir0o/cisa-campus-work-tracker/pull/543) translate Visits page static UI to Spanish | #523 |  | **uncovered** |
| 08-23 | [#518](https://github.com/Shir0o/cisa-campus-work-tracker/pull/518) translate My Day prayers and prayer controls to Spanish | none |  | **uncovered** |
| 08-23 | [#514](https://github.com/Shir0o/cisa-campus-work-tracker/pull/514) translate prayer page and prayer surfaces to Spanish | none |  | **uncovered** |
| 08-23 | [#513](https://github.com/Shir0o/cisa-campus-work-tracker/pull/513) add mobile static Spanish dictionary and wire t() | #476 |  | **uncovered** |
| 08-23 | [#512](https://github.com/Shir0o/cisa-campus-work-tracker/pull/512) translate ContactDetailsModal and CoordinationNotes, add i18n CI guard, use self-hosted ru | #470, #475, #477 |  | **uncovered** |
| 08-22 | [#481](https://github.com/Shir0o/cisa-campus-work-tracker/pull/481) translate Outreach.tsx and SmartImportModal to Spanish (#471 #472) | #471, #472 |  | **uncovered** |
| 08-22 | [#480](https://github.com/Shir0o/cisa-campus-work-tracker/pull/480) translate FeedbackList and OutreachBoard to Spanish (#473 #474) | #473, #474 |  | **uncovered** |
| 08-22 | [#479](https://github.com/Shir0o/cisa-campus-work-tracker/pull/479) localize browser and PWA metadata for Spanish | #478 |  | **uncovered** |
| 08-22 | [#469](https://github.com/Shir0o/cisa-campus-work-tracker/pull/469) translate more views, shared components, and modals to Spanish | none |  | **uncovered** |
| 08-22 | [#466](https://github.com/Shir0o/cisa-campus-work-tracker/pull/466) debounce translation requests, deduplicate in-flight queries, and add timeout protection | none |  | **uncovered** |
| 08-21 | [#458](https://github.com/Shir0o/cisa-campus-work-tracker/pull/458) complete spanish translation work (#419 #420 #421 #422) | #419, #420, #421, #422 |  | **uncovered** |
| 08-21 | [#426](https://github.com/Shir0o/cisa-campus-work-tracker/pull/426) Spanish Localization Dictionaries, Dynamic UGC Toggles & Mobile Parity (#420, #421, #422) | #420, #421, #422 |  | **uncovered** |
| 08-20 | [#425](https://github.com/Shir0o/cisa-campus-work-tracker/pull/425) wire full Spanish translation across navigation and app content | #351 |  | **uncovered** |

### Nav, shell & design system

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-13 | [#992](https://github.com/Shir0o/cisa-campus-work-tracker/pull/992) add Your notes (/feedback) to the left rail | none |  | partial: feedback-submission (reaches /feedback) |
| 09-07 | [#874](https://github.com/Shir0o/cisa-campus-work-tracker/pull/874) surface the Lion Mark on every icon surface | none |  | **uncovered** |
| 09-04 | [#829](https://github.com/Shir0o/cisa-campus-work-tracker/pull/829) standardize app-wide border radius scale monotonically | #688 |  | **uncovered** |
| 09-04 | [#814](https://github.com/Shir0o/cisa-campus-work-tracker/pull/814) a route trail in the shell, and a selected state that survives a record route | #803 |  | **uncovered** |
| 09-03 | [#785](https://github.com/Shir0o/cisa-campus-work-tracker/pull/785) shared Switch primitive for club-rush / recurring / day-goal toggles | #712, #764 |  | **uncovered** |
| 09-02 | [#746](https://github.com/Shir0o/cisa-campus-work-tracker/pull/746) remove collapse button on side menu | #681 |  | **uncovered** |
| 09-01 | `2e1a6761` the rail becomes a floating slab, and dark stops swallowing its own states | none |  | **uncovered** |
| 08-31 | [#673](https://github.com/Shir0o/cisa-campus-work-tracker/pull/673) collapse/expand control with badge, focus tooltip, wordmark reduce | #665 |  | **uncovered** |
| 08-30 | [#671](https://github.com/Shir0o/cisa-campus-work-tracker/pull/671) Ink design system — neutral shell, black accent, display face | #663 |  | **uncovered** |
| 08-29 | [#660](https://github.com/Shir0o/cisa-campus-work-tracker/pull/660) selection states fill solid + invert | none |  | **uncovered** |
| 08-18 | [#364](https://github.com/Shir0o/cisa-campus-work-tracker/pull/364) top-anchored navigation + do-everything ⌘K palette | none |  | partial: permissions (nav items per role) |

### Settings, auth & security

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-03 | [#1331](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1331) add pending state to Google sign-in button | #1311 |  | **uncovered** |
| 09-27 | [#1235](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1235) manage and generate attd sync token from web settings | #1234 |  | **uncovered** |
| 09-19 | [#1146](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1146) add TOTP multi-factor authentication across web and mobile | none |  | **uncovered** |
| 09-19 | [#1145](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1145) configure Firebase App Check for web with monitoring-first rollout | none |  | **uncovered** |
| 09-19 | [#1144](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1144) enforce noindex headers and redact record ids from published feedback URLs | #1121, #1143 |  | **uncovered** |
| 09-04 | [#815](https://github.com/Shir0o/cisa-campus-work-tracker/pull/815) allow full-timers and users to edit display names | none |  | **uncovered** |
| 09-03 | [#799](https://github.com/Shir0o/cisa-campus-work-tracker/pull/799) add two-phase Test Account Purge tool | #758 |  | **uncovered** |
| 08-29 | `e8ea45c1` live Gemini AI status badge + document GEMINI_API_KEY scope | none |  | **uncovered** |
| 08-29 | [#659](https://github.com/Shir0o/cisa-campus-work-tracker/pull/659) live Gemini AI status badge + document GEMINI_API_KEY scope | none |  | **uncovered** |
| 08-19 | [#386](https://github.com/Shir0o/cisa-campus-work-tracker/pull/386) role-aware first-run checklist and settings clean-up (#335, #362) | #335, #362 |  | **uncovered** |

### Help & What's New

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-05 | [#1389](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1389) link First-Run Checklist steps into Help | #1343 |  | **uncovered** |
| 10-05 | [#1387](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1387) add the /help route, renderer and role filter | #1342 |  | **uncovered** |
| 10-05 | [#1385](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1385) compile the help corpus to a build-time manifest | #1341 |  | **uncovered** |
| 09-30 | [#1281](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1281) google drive video companion with role-based IAM gating | #1151 | 9 | partial: whats-new-video-spike (#1151) |
| 09-21 | [#1160](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1160) setup release video hosting and manual capture workflow | #1151 | 9 | covered: whats-new-video-spike (#1151) |
| 09-20 | [#1153](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1153) add What's New Video release companion | #1123, #1151 | 9 | covered: whats-new-video-spike (#1123) |
| 09-19 | [#1147](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1147) auto-draft release notes on each release tag | #1118 |  | **uncovered** |
| 09-04 | [#824](https://github.com/Shir0o/cisa-campus-work-tracker/pull/824) categorize release notes with color badges and tighten layout | #821 |  | **uncovered** |
| 09-04 | [#816](https://github.com/Shir0o/cisa-campus-work-tracker/pull/816) tailor-made What's New popups with release note compilation and git commit fallback | #812 | 8 | **uncovered** |

### Mobile native & release

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-19 | [#1148](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1148) bring the BFA intake tag to mobile, mirroring web | #1117 |  | **uncovered** |
| 09-18 | [#1137](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1137) add Your notes read-back view | #1104 |  | **uncovered** |
| 09-15 | [#1046](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1046) one authored record rendered as announcement + nudge | #1021 |  | **uncovered** |
| 09-13 | [#994](https://github.com/Shir0o/cisa-campus-work-tracker/pull/994) attach Play release notes after eas submit | none |  | **uncovered** |
| 09-13 | [#991](https://github.com/Shir0o/cisa-campus-work-tracker/pull/991) automate the mobile release to Play internal and TestFlight | none |  | **uncovered** |
| 09-03 | [#807](https://github.com/Shir0o/cisa-campus-work-tracker/pull/807) mobile pass follow-ups for touch targets, action ordering, loading fallback, and off-palet | #761 | 25 | covered: mobile-viewport (#761), overflow and touch targets only |
| 09-01 | [#736](https://github.com/Shir0o/cisa-campus-work-tracker/pull/736) unified mobile and PWA contact editing flow | #633 |  | covered, spec red: mobile-and-pwa-contact-editing (#633); red every run 9-02 to 9-21 |
| 08-28 | [#643](https://github.com/Shir0o/cisa-campus-work-tracker/pull/643) add 'Tell us how it\'s going' feedback entry points across all mobile shells | none |  | **uncovered** |

### Gatherings & attendance

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-05 | [#1388](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1388) redesign Came / We missed with a shared member chip | #1382 | 28 | **uncovered** |
| 09-24 | [#1210](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1210) add Homes and "Who we haven't seen" reading (closes #1194) | #1194 | 30 | **uncovered** |
| 09-14 | [#1033](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1033) stage attd sync intake and review | #1022 | 16 | **uncovered** |
| 09-14 | [#1027](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1027) move attendance onto the Gathering | #958 | 9 | **uncovered** |
| 09-03 | [#797](https://github.com/Shir0o/cisa-campus-work-tracker/pull/797) record a Gathering nobody came to | #776 | 30 | **uncovered** |
| 09-03 | [#796](https://github.com/Shir0o/cisa-campus-work-tracker/pull/796) align figures card and fold Rhythms into one row | #776 | 30 | **uncovered** |
| 09-02 | [#771](https://github.com/Shir0o/cisa-campus-work-tracker/pull/771) gathering roster selection and walk-in attendance | #766 |  | **uncovered** |

### Questions for the team

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 08-31 | [#693](https://github.com/Shir0o/cisa-campus-work-tracker/pull/693) delete a single reply on Questions for the team | #680 |  | **uncovered** |
| 08-28 | [#651](https://github.com/Shir0o/cisa-campus-work-tracker/pull/651) delete a question on "Questions for the team" | none |  | **uncovered** |
| 08-28 | [#648](https://github.com/Shir0o/cisa-campus-work-tracker/pull/648) move "Questions for the team" out of Messages onto its own page (#646, #647) | #646, #647 |  | covered: asks-questions-for-team (#646) |
| 08-28 | [#649](https://github.com/Shir0o/cisa-campus-work-tracker/pull/649) team-wide question archive for staff | #645 | 13 | covered: asks-questions-for-team stories 11-13 (#645) |
| 08-27 | [#635](https://github.com/Shir0o/cisa-campus-work-tracker/pull/635) distinguish direct vs. recorded in-person questions | #611 |  | covered: asks-questions-for-team story 5-7 |
| 08-24 | [#548](https://github.com/Shir0o/cisa-campus-work-tracker/pull/548) Ask the team — person-less trainee questions | #545 |  | covered: asks-questions-for-team story 3-4 |
| 08-18 | [#341](https://github.com/Shir0o/cisa-campus-work-tracker/pull/341) hide completed My Day tasks by default | none |  | **uncovered** |

### Prayer (On our hearts)

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-03 | [#788](https://github.com/Shir0o/cisa-campus-work-tracker/pull/788) remove someone from the card's row menu, with undo | #714, #715 |  | **uncovered** |
| 09-02 | [#779](https://github.com/Shir0o/cisa-campus-work-tracker/pull/779) prompt for optional reason when archiving a prayer | #708 |  | **uncovered** |
| 09-02 | [#778](https://github.com/Shir0o/cisa-campus-work-tracker/pull/778) allow clearing a prayer from /prayer row | #706 |  | **uncovered** |
| 09-02 | [#745](https://github.com/Shir0o/cisa-campus-work-tracker/pull/745) display cared for by and added by in on our hearts header | #716 |  | **uncovered** |
| 09-01 | [#704](https://github.com/Shir0o/cisa-campus-work-tracker/pull/704) replace "holding" with "praying for" on the prayer surface | none |  | **uncovered** |
| 08-26 | [#602](https://github.com/Shir0o/cisa-campus-work-tracker/pull/602) indicate stale contacts and add quick actions | #554 |  | **uncovered** |

### Notifications & push

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 10-01 | [#1318](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1318) weekly reminders and their Settings | #1301 |  | **uncovered** |
| 10-01 | [#1312](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1312) remind the asker when an ask or question goes unanswered | #1289 |  | **uncovered** |
| 09-02 | [#775](https://github.com/Shir0o/cisa-campus-work-tracker/pull/775) soft in-app notification permission prompt on open | #694 |  | **uncovered** |
| 08-27 | [#626](https://github.com/Shir0o/cisa-campus-work-tracker/pull/626) harden push registration lifecycle & add test diagnostics tool | #590 |  | **uncovered** |
| 08-19 | [#391](https://github.com/Shir0o/cisa-campus-work-tracker/pull/391) notification stacking by target entity | #331 |  | **uncovered** |

### Coordination docs

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-19 | [#1149](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1149) add QR code for coordination doc guest links on web and mobile | none |  | **uncovered** |
| 09-14 | [#1026](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1026) guest links for coordination docs | #1023 | 14 | **uncovered** |
| 09-05 | [#848](https://github.com/Shir0o/cisa-campus-work-tracker/pull/848) password visibility toggle and first-run progress meter | #845 | 8 | **uncovered** |
| 08-26 | [#586](https://github.com/Shir0o/cisa-campus-work-tracker/pull/586) localize coordination note cards and dynamic content in Spanish | none |  | **uncovered** |
| 08-23 | [#520](https://github.com/Shir0o/cisa-campus-work-tracker/pull/520) Spanish translation for Board Docs contents and coordination screens | none |  | **uncovered** |

### Partners & pairing

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-15 | [#1080](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1080) backfill existing contacts with their founders | #1050 |  | **uncovered** |
| 09-15 | [#1079](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1079) found a person brought in by a pair — founding set written at creation | #1049 |  | **uncovered** |
| 09-15 | [#1078](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1078) dated pairing model — types + interval logic | #1048 |  | **uncovered** |
| 09-11 | [#976](https://github.com/Shir0o/cisa-campus-work-tracker/pull/976) dynamically resolve contact visibility for active gospel partner pairings | #971 |  | **uncovered** |
| 08-24 | [#550](https://github.com/Shir0o/cisa-campus-work-tracker/pull/550) every full-timer stands over every trainee — drop the "your full-timer" pairing | #549 |  | **uncovered** |

### Rules & data layer

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-16 | [#1086](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1086) enforce immutable founders, carer tie, and no caregiver | #1055 |  | **uncovered** |
| 09-14 | [#1036](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1036) enforce the tie in the Firestore rules (#1024 phase 4, part 2/2) | #1024 | 40 | **uncovered** |
| 08-30 | [#669](https://github.com/Shir0o/cisa-campus-work-tracker/pull/669) colour-token regression guard | #661 |  | **uncovered** |
| 08-20 | [#423](https://github.com/Shir0o/cisa-campus-work-tracker/pull/423) add batch translation endpoint with Gemini and Firestore caching | #351 |  | **uncovered** |

### Sign-up & outreach

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 09-26 | [#1233](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1233) attribute GroupMe sender as contact creator | #1103 |  | **uncovered** |
| 09-15 | [#1065](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1065) tag BFA intake alongside club rush | #1045 |  | **uncovered** |
| 09-01 | [#737](https://github.com/Shir0o/cisa-campus-work-tracker/pull/737) match teammate profile and assign owner on webhook quick-add | none |  | **uncovered** |

### Calendar

| Merged | PR | Closes | Stories | Coverage |
|---|---|---|---|---|
| 08-24 | [#519](https://github.com/Shir0o/cisa-campus-work-tracker/pull/519) integrate shared team calendar view and My Day schedule sync | none |  | **uncovered** |
