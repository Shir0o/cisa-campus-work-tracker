# Design/build drift register

A living record of places where the design artefacts and the shipped code
disagreed, which one was right, and how it was settled.

## Why this file exists

The design sources under `docs/design/` are HTML artboards. Nobody diffs them
against the application, and nothing fails when they stop describing it. That is
not a flaw in the drawings — a canvas that could be diffed against React would
just be React — but it means drift is found by accident, usually months later
and usually by someone looking at something else.

The first ten entries below were all found in one sitting, prompted by a question
about dark mode: eight by reading the artboards and the specs against the source
line by line, and one (#9) only by walking the running app in both themes.
Three were real bugs, three were the build ignoring a written decision, one was a
token that was specified and never added, one was a spec the build had quietly
improved on, and one was the whole shell. The point of writing them down
is so the next set is found on purpose.

**When you change shell chrome, tokens, or anything the artboards draw, add a
row here.** Say which artefact was right. "The build was right and the drawing
is stale" is a legitimate and common answer — see #8.

## Register

### 2026-09-01 — the dark-mode review

Found reviewing the rail in dark; settled together in one branch. Sources:
[`ink-dark/Findings.dc.html`](ink-dark/Findings.dc.html) for 3, 6 and 7,
[`ink-dark/Directions.dc.html`](ink-dark/Directions.dc.html) for 1.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 1 | The rail shipped as a flush `bg-surface` column with a right border. `ink/NavPref.dc.html`, `ink/Home.dc.html` and `ink/Shells.dc.html` all draw a near-black slab, floating, 32px radius, with a shadow — in light. It was never built, in either theme. | **Design** | Built as direction B, with a dedicated rail token namespace so light gets the black slab and dark gets a raised one. [ADR 0003](../adr/0003-nav-rail-floating-shell.md). |
| 2 | `docs/specs/ink-design-system.md` says "A shell-level shadow token is added for raised chrome." No such token was ever added. | **Spec** | `--shadow-shell` added to both theme blocks and to `@theme`. The floating rail is its first consumer. |
| 3 | `.dark` pointed `--surface-container-high` and `-highest` at `--bg-elev`, which is the same value as `--panel`. Every `hover:bg-surface-container-high` on a `bg-surface` parent therefore painted the surface its own colour — the raised state was a no-op across 200 usages in 44 files. Light has always pointed at `--panel-2`. | **Neither — a bug** | Both now point at `--panel-2` in dark, matching light. |
| 4 | Rail items used `rounded-xl`. Ink re-values `--radius-xl` to 32px for shell containers, which a 44px item clamps to a pill and a 44×44 collapsed item to a circle. The nav spec's Implementation Decisions say items are "44×44 squares at the interactive radius rather than pills, because a pill at that width reads as a circle." | **Spec** | Items and the logo tile moved to `rounded-[14px]`. `--radius-xl` is unchanged and is what the floating rail itself now uses. |
| 5 | Breakpoints. The build fell through to mobile below 768px and forced the collapsed rail from 768–1179px. The spec and `ink/NavPref.dc.html` both say below 1024px and 1024–1279px. | **Spec** | `RAIL_FITS_MIN_WIDTH` 1180 → 1280; the rail's gates moved `md` → `lg`. See the note below on what "falls through" turned out to mean. |
| 6 | The Questions unread badge was `text-on-primary` on `bg-primary/15` — a pairing that only works on top of the selected fill. On a resting item it renders ~1.6:1 in **both** themes, so the count was invisible on every destination except the one you were already looking at. | **Neither — a bug** | The badge now follows the item: inverted ink on the selected pill, rail ink on a `--rail-hover` chip otherwise. |
| 7 | `GlobalSearch`'s hover ring was a literal `#525E6F` — a Bento blue-grey, off Ink's neutral axis, and identical in both themes. One of the fourteen hardcoded hex values the Ink spec knowingly left in place. | **Neither — stale** | Moved to `--accent-line`, which is already theme-dependent. `GlobalSearch.test.tsx` pinned the literal and had to be updated; the Ink spec predicted exactly this ("a test that needs editing indicates a hardcoded colour that should have become a token"). Thirteen remain. |
| 8 | `ink/NavPref.dc.html` and the nav spec pin an account block — avatar, name, role — inside the rail. The build has no account block in the rail; the avatar lives in `NavChromeStrip`. | **Build** | The spec was internally inconsistent: it already argues that search and notifications belong to the shell so they are written once, and the avatar is the same case. The rail should not own a third copy. Spec and artboard corrected to match. |
| 9 | My Day's "Next up" card — still commented "solid violet card" — was `bg-accent-strong text-white`. `--accent-strong` is `#131316` in light and `#FAFAFA` in dark, so in dark the entire card rendered white text on a white fill: heading, body and chips all invisible. | **Neither — a bug** | Moved to the `text-accent-on` / `bg-accent-strong` pair, including the `/75`, `/80`, `/85` alpha variants and the `bg-white/15 border-white/20` chips. |
| 10 | In compact/collapsed rail mode (`rail-collapsed`), destination items used `mx-2` (left margin 8px on a 44px tile inside the 76px rail), displacing all destination glyphs 8px to the left of the centered header brand logo, Settings icon, and collapse chevron. | **Neither — a bug** | Moved to `mx-auto` when collapsed so the 44×44 square tiles sit with symmetric 16px margins, centering every icon at `x = 38px` along the rail's vertical axis. (#728) |

**#9 was found by walking the app**, not by reading it — it is the single thing on this list that no amount of comparing documents would have surfaced, and it is also the exact failure the Ink spec predicted in writing: *"Anything that hardcodes white on top of `bg-primary` instead of using `text-on-primary` breaks in dark mode."* The spec said to verify it by walking both themes. That had not been done. Do it.

One user-facing string was corrected alongside #5: Settings' navigation help said mobile navigation is used below the large breakpoint, which was never quite true and is now clearly wrong — below `lg` you get the top bar, and the bottom bar only below `md`.

#### On #5, and what "falls through to MobileNav" means

The spec says every state "falls through to the existing mobile bottom
navigation" below the large breakpoint. Read literally that would move
`MobileNav` from `md:hidden` to `lg:hidden`, which gives 768–1023px both
`TopNav`'s hamburger drawer *and* a bottom bar.

What it means in practice, and what was implemented: below `lg` the rail is not
rendered and the shell falls through to the **top-bar branch**, which already
carries its own drawer under `lg`; `MobileNav`'s bottom bar keeps its own `md`
threshold. The spec has been amended to say this.

## Guardrails that exist

- `npm run check:colors` — blocks new raw hex and raw Tailwind palette classes
  on lines added in the diff. It compares `base...HEAD`, so it sees committed
  work only. Note what it did *not* catch: #9 was `text-white`, which is a
  Tailwind utility rather than a palette class or a hex, so it passed the guard
  while being exactly the defect the guard exists to prevent. `text-white` and
  `text-black` on a themed fill are worth adding to it.
- `npm run check:i18n` — the same shape, for hardcoded UI strings.
- Nothing checks an artboard against a component, and nothing sensibly could.
  This file is the substitute, and #9 is the reminder that reading is not
  enough — the app has to be opened in both themes.

### 2026-09-03 — the prayer compose box

Found from user feedback on `/prayer` ([#705](https://github.com/Shir0o/cisa-campus-work-tracker/issues/705)),
settled on the canvas at [`prayer-composer/`](prayer-composer/).

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 11 | The prayer compose boxes put `rounded-xl` on their textarea and photo dropzone. Same root cause as #4: Ink re-values `--radius-xl` to 32px for shell containers, and these controls are 62px, 54px and 38px tall, so CSS clamps the radius to half each box and paints three stadiums. Their panel is `rounded-2xl`, which is *not* re-valued and stays at Tailwind's 16px — so the nesting inverted, a 16px panel holding 31px children inside a 24px card. | **Neither — a bug** | Compose panels moved to `rounded-[14px]`, controls and the 64px answer thumbnails to `rounded-sm`, in all seven compose boxes. The nest now descends: card 24 → panel 14 → controls 10. `--radius-xl` is unchanged. `prayerComposerRadius.test.ts` pins it, since jsdom cannot observe a clamp. |
| 12 | `@theme` re-values `--radius-sm`, `--radius`, `--radius-lg` and `--radius-xl` but never names `--radius-md`, `--radius-2xl` or `--radius-3xl`, which keep Tailwind's defaults. The utility ladder is therefore non-monotonic in three places — `sm` (10) > `md` (6), `lg` (24) > `2xl` (16), `xl` (32) > `3xl` (24) — so `rounded-xl` is the roundest non-pill step in the app, and reaching for `2xl` to tone it down gets you *less* round than `lg`. | **Neither — a bug** | **Open.** #11 fixes the one instance that was reported; the ladder itself is untouched and still misleads at 421 call sites. Re-basing it needs its own ADR — the drawing is [`prayer-composer/Ladder.dc.html`](prayer-composer/Ladder.dc.html). |
| 13 | `--radius-pill: 999px` is declared in both theme blocks and on `@theme`, and has zero uses. All 580 pills are `rounded-full`, which reads no token at all — Tailwind compiles it to `calc(infinity * 1px)`. | **Build** | **Open.** Harmless, but the token implies a `rounded-pill` utility nobody calls. Delete it or adopt it; noted here so the next reader does not assume it is load-bearing. |

### 2026-09-03 — the news feed filters

Found building [#727](https://github.com/Shir0o/cisa-campus-work-tracker/issues/727)
against the canvas at [`news-filters/`](news-filters/). #14 was drawn on
`Highlight.dc.html` before the build started; #15 was found by reading the
artboard's own measurements back against the tokens while implementing it.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 14 | An attention stack card marks itself unread with `bg-surface border-outline-variant` and read with `bg-surface/60 border-outline-variant/40`, inside a column card that is *also* `bg-surface`. The fills are identical, so the whole ladder rests on a 1px `#F0F0F2` border against `#F4F4F5` — **1.04:1**, invisible in light theme. Only the 8px accent dot and the appearance of "Mark scanned" carry unread. | **Drawing** — the canvas predicted it and drew around it | **Open.** The new "Talked" chip stands on colour (`text-stage-accent bg-stage-accent-soft`) rather than on a border, precisely so it does not inherit this, and does not depend on the ladder being fixed first. Fixing the ladder wants a surface step, which is a token conversation: moving unread to `--outline` (`#E4E4E7`) is 1.16:1 and barely helps. |
| 15 | `States.dc.html` measures the selected filter chip as *"Selected takes `--background` and `--on-surface`"*, but `History.tsx:420–429` — which the canvas asked be copied verbatim — paints it `bg-surface` on a `bg-surface-container-low` track. In light theme both `--surface` and `--surface-container-low` resolve to `--panel` (`#F4F4F5`, `src/index.css:214,223`), so the selected chip has **no fill difference at all**; only its text colour changes. Dark theme is fine (`--panel` vs `--panel-2`). Same class of defect as #14, in the control rather than the card. | **Drawing** — the measured token was right, the shipped one is wrong | The two new rows (the feed's filter row, and the team picker in Settings) use `bg-background`, which is distinct from the track in **both** themes. `History.tsx` still has the original and is **open** — it is pre-existing and outside this change; fixing it is a one-class edit whenever someone is in that file. |

### 2026-09-03 — the prayer fold and its line colours

Found from user feedback on `/prayer` ([#709](https://github.com/Shir0o/cisa-campus-work-tracker/issues/709)
— *"the folded looks funky and crammed and the line coloring"*), reported in the
dark theme at 1107×662 and settled on the canvas at [`prayer-fold/`](prayer-fold/).

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 16 | `PrayerItem`'s 2px left rail carried two unrelated facts on one value — *where you are in the thread* and *how the prayer landed*. So one card ran `border-l-primary` (`#FAFAFA`, 17.3:1 on the card, the loudest object on the page) down to `border-l-outline-variant` (1.15:1, i.e. not drawn), with `border-l-success/50` at 3.5:1 in between. Three full-width `bg-outline-variant` eyebrow rules crossed those rails at the same 1.15:1. Neither axis read as structure. Light inverted it exactly: a `#131316` rail at 16.9:1, `#F0F0F2` rules at 1.04:1. | **Neither — a bug** | One neutral spine at `--outline` carries the structure; a 9px dot on it carries the state, ringed when it is this week. The three rules are gone — the section eyebrows keep their words as inline uppercase labels. Both surfaces, desktop and mobile. |
| 17 | Opening the fold added ≈396px for four prayers, 85px each, of which 144px was a Mark chip row printed once per entry for history nobody is marking — and the four entries had no gap and no divider, so one entry's chips butted into the next entry's date. The card reached ≈824px on a 662px window. | **Neither — a bug** | Desktop: an earlier prayer is one 30px summary line — date, mark, burden — that opens in place. Mobile keeps its expanded items; it already spaces them (`space-y-2`) and marks them with a native select, so the cramming was desktop-only. |
| 18 | The fold's disclosure arrow was a literal `▶` text glyph at `text-[9px]` (desktop) / `text-[10px]` (mobile), so it sat off the baseline of the label beside it and could not take a stroke weight. | **Neither — a bug** | A real `ChevronRight`, in a 16px node on the spine. |
| 19 | The thread card's own border was `border-outline-variant` — the same undrawn 1.15:1 / 1.04:1 value as the rules — so every card on the page floated with no edge. | **Neither — a bug** | Moved to `--outline` with the spine. It only reaches 1.27:1 / 1.15:1; a hairline is meant to be quiet, and the spread was the bug, not the quietness. |
| 20 | The person's name clipped to *David Alvara…* with ~380px of the header row empty beside it: the left button was a flex child that never grew, so it was sized to its own content and then truncated. | **Neither — a bug** | `flex-1` on that button. Found in the reporter's screenshot, not by reading the markup — the mechanism was not obvious from the source. |

### 2026-09-03 — the chrome strip's blank half

Found from user feedback on `/people/:contactId`
([#803](https://github.com/Shir0o/cisa-campus-work-tracker/issues/803) —
*"what do we do with the top blank space to the left of the search bar"*),
reported at 1491×806 and settled on the canvas at
[`chrome-strip/`](chrome-strip/). #21 is the reported one; #22 and #23 were
found by measuring the band and by drawing the same fix in the other shell.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 21 | `NavChromeStrip` is `TopNav`'s chrome hoisted into the rail shell, still right-aligned behind a `flex-1` spacer. At the reporter's width that leaves **773 × 56 px** of the content column empty on every page in rail mode — a row reserved for a bar that ADR 0003 removed. The strip's own comment already said "there is no bar to be the edge of". | **Neither — an inheritance** | The band carries the route trail (`‹ People / David Alvarado`) at 13px, `pl-6` so it lines up with the page's gutter rather than the column edge. Three other directions were drawn and rejected on the canvas: a full page-header row, removing the band, and stretching search into it. |
| 22 | `RailItem`'s `isActive` tested `currentPath === item.href \|\| currentPath.startsWith(item.href + '/')`. `/people/:contactId` is neither `/directory` nor a child of it, so **no rail destination was selected at all** on a contact page. Nothing in the rail shell said where you were. | **Neither — a bug** | `sectionHrefFor` in `src/lib/navTrail.ts` resolves a path to the destination it belongs to; both shells select on it, and the trail reads the same map. `RailItem` moved from `NavLink` to `Link` — NavLink derives `aria-current` from its own pathname match, which is exactly the match that was wrong. |
| 23 | The top bar was not merely silent on the same route, it was **wrong**: More held its active state for any path outside the primary three, and its glyph was `NavGlyph href={pathname}`, which falls through to the dashboard icon for an unmapped path. So a contact page showed a highlighted *More* wearing a generic square. | **Neither — a bug** | Both now read `sectionHrefFor(pathname)`: the People tab lights, More rests. The trail gets a 40px row of its own inside the sticky header block, `leafOnly` — a top-level route's active tab already names it. |

`TopNav`'s brand tile is `rounded-xl` on a 36×36 box, so `--radius-xl` (32px)
clamps to 18 and paints a circle — the same defect as #4 and #11, in the one
place neither fixed. Drawn as it renders on
[`chrome-strip/TopBar.dc.html`](chrome-strip/TopBar.dc.html) and **left open**:
it is not what #803 reported, and it wants the ladder conversation in #12.

### 2026-09-04 — asking a trainee a question

Found while designing the Full-timer → Trainee question flow for
[#813](https://github.com/Shir0o/cisa-campus-work-tracker/issues/813), by reading
the notify path, the feed derivations and the locale files against each other.
The design is on the canvas at [`followup-reach/`](followup-reach/). Unlike the
dark-mode review, none of these were found by walking the app: every one is a
reader with no writer, a branch with no caller, or two words for one thing.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 24 | `contact.reviewed` — "whether the full-timer walking with the adder has reviewed this contact" (`types.ts:33`) — is read in four places (`attention.ts:104`, `attention.ts:277`, `AttentionFeed.tsx:331`, `LandingTrainee.tsx:399`) and **written by nothing but `seed-qa.ts` and `seed-walking-demo.ts`**. For every real contact it has always been `undefined`, so the entire reviewed/unreviewed axis silently collapses to the `localStorage` fallback beside it. | **Neither — dead** | Field deleted along with its four readers. Reviewing is now explicitly private to the person doing it and lives per-user in `inboxState/{uid}`; the Trainee-facing status it fed is deleted too (row 25). |
| 25 | `LandingTrainee.tsx:399` computes `seen = weighedInBy[id] \|\| !!contact.reviewed` but line 419 prints `weighedInBy[id]`, so a contact marked `reviewed` with no thread reply would have rendered the literal string **"undefined weighed in"**. Unreachable only because row 24 means the field is never set. Both strings are also hardcoded English, outside the locale files. | **Neither — a latent bug** | Both the status and its derivation deleted: a Trainee learns nothing about a Full-timer's attention unless the Full-timer deliberately sends something. |
| 26 | `attention.ts:92` and `:330` gate the Trainee's whole feed on `role === "trainee"`, but `AppRole` is `'admin' \| 'manager' \| 'operator' \| 'viewer'` — a Trainee is `manager`. **The branch has never executed.** No test covers it (`attention.test.ts` only ever passes `role: "admin"`). A Trainee's *What's new* has therefore only ever contained @mentions, assigned to-dos and notification documents. | **Neither — dead** | Branch deleted rather than revived: as written it would have given every Trainee every Full-timer message on every contact. Trainee items are now derived from the four ties, the same set the notification reach uses, so the feed and the bell agree on who is involved. |
| 27 | `attentionPhrase` (`attention.ts:318`) returns `"${firstName} asked you something"` for **every** thread item regardless of kind, so a note, a comment, an encouragement and a follow-up all announce themselves as a question the reader owes an answer to. | **Neither — a bug** | One line per kind, matching the completion verb on the same card. |
| 28 | `Thread.tsx` hardcodes `kind: "comment"` at both post sites (`:235`, `:420`). `THREAD_KINDS` has carried five kinds since it was written; `"question"` is posted **nowhere** in the web app, and its bell title (`"asked about"`) has never rendered. A Full-timer has never been able to ask a question on a contact. | **Neither — dead** | A segmented control — Comment · Question · Ask a follow-up — in both the inline composer and the Conversation tab. |
| 29 | Two words for one list, six lines apart in the same locale namespace: `"no_interactions": "No interactions logged yet."` and `"no_conversations": "No conversations logged yet."` (`en.json:1317-1318`), with "Interaction" appearing 41 times across the file and "conversations" twice. `CONTEXT.md` nonetheless declared the web log to be called *Conversations*. | **Build** | The build was right. The two stray strings are corrected to Interactions, `CONTEXT.md` updated, and the word "Conversation" freed for the contact's staff thread — which was itself titled "Follow-up" while its own subtitle called it "Comments on {name}". |
| 30 | `sendPushNotification` — the Expo path that reaches a phone with the app closed — is called only from `services/chat.ts` and a Settings test button. `sendNotification` (the bell) never calls it, and `showWebPushNotification` fires from inside an `onSnapshot` in a mounted `NotificationCenter`, so on web it only fires **if the tab is already open**. Nothing about a contact has ever reached a phone that was not already looking. | **Neither — a gap** | Questions and follow-up asks push through the existing Expo path, coalesced to at most one per contact per person per hour. |
| 31 | Web imports neither `FromTraineesInbox.tsx` nor `lib/inbox.ts` (`inboxItemsFor`) — the purpose-built Full-timer oversight inbox — and derives the same surface a second time through `attention.ts`. Mobile uses `inboxItemsFor` (`useFtHomeData.ts:241`, `useMyDayData.ts:220`). Two models of one thing, diverging by platform, with two read-state stores (`UserEntityState` on web, `InboxReads` on mobile) plus the legacy `inboxReads` still imported by `AskStack` and `LandingTrainee`. | **Neither — a duplicate** | `FromTraineesInbox.tsx` and web's `lib/inbox.ts` deleted; web's feed becomes the worklist. Mobile keeps `inboxItemsFor` until the two derivations are unified, which is its own piece of work — building a mobile worklist on a fourth storage layer would be worse than waiting. |
| 32 | `buildAttentionItems` split on role and the two halves disagreed about what a message is. The Full-timer branch collected **only** `kind === "question"`, so a note, a comment or a follow-up ask written on a contact a Full-timer carries never reached their feed — while the Trainee branch beside it collected every kind on a tied contact. Found building the completion verbs: three rows of the verb table in `Inbox.dc.html` (*Got it* for a note, *Got it* for a comment, *I followed up* for an ask) had no card that could ever render them. | **Design** | One pass for both roles, gated on the same four ties the notification reach uses. A Full-timer keeps the one thing that is genuinely theirs — unanswered questions on **anyone**, tie or not, which is the oversight this feed exists for. Students and Community members still get nothing. |


### 2026-09-14 — the Around the team conversation review

Found while designing the in-place Conversation strip for
[#965](https://github.com/Shir0o/cisa-campus-work-tracker/issues/965) and
[#966](https://github.com/Shir0o/cisa-campus-work-tracker/issues/966), by reading
the thread model, the attention partition and the two count derivations against
each other. The design is on the canvas at
[`around-conversation/`](around-conversation/); the decisions are in
[ADR 0022](../adr/0022-around-the-team-has-one-worked-through-state.md).

Row 33 is the one to read first: it is a half-finished data migration, and it is
invisible from `src/` alone.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 33 | **The comments → threads migration was started and never finished.** `threads.ts:21` states "The old `contacts/{id}/comments` subcollection has been retired", and on web it is: nothing under `src/` reads or writes it. But `packages/core/src/data/comments.ts:17` still reads and writes that subcollection and is re-exported from the package index (`index.ts:61`), `packages/core/src/data/contacts.ts:101` subscribes to the `comments` collection group, and **mobile's two main screens still run on it** — `useFtHomeData.ts:165` and `useMyDayData.ts:135` subscribe to the group, `apps/mobile/src/lib/data/comments.ts:44` writes to it. `scripts/migrate-comments-to-threads.ts` exists and copies old comments into `threads` with `scope: "team"` and `legacyComment: true`, but it is **copy-only by design** ("It never deletes the old comments subcollection") and nothing cut the mobile writer over. So even after a successful run, every comment a Full-timer writes on their phone still lands in the old collection and is invisible to every web surface. Two live comment stores, split by platform, with a one-way copy between them. | **Neither — an unfinished migration** | Not resolved here. The Firestore rules for `contacts/{id}/comments` (`firestore.rules` ~240-251 and the collection-group rule ~959-961) **must not be deleted** while mobile depends on them; a cleanup briefed from a `src/`-only grep would take the mobile home screen down. Finishing it is its own piece of work: cut mobile's reads and writes over to `threads`, re-run the migration, then retire the subcollection and its rules in that order. Note the migration writes `scope: "team"`, so migrated comments land in the **Full-timers** tab, not **Conversation** — which is the right audience for the old admin-only Comments, but means they do not appear in the surface this design draws. |
| 34 | Two numbers for one page, counting different axes. `/around`'s header pill is `toWorkThrough`, cut on `InboxState.isCompleted` (`AroundTheTeam.tsx:282`, `:360`), and the New/All filter cuts on the same. My Day's pointer card counts `unseenTeamCount(..., InboxState.isSeen)` (`PointerCard.tsx:122`). [ADR 0015](../adr/0015-around-the-team-own-destination.md) decision 2 promised the pointer "can never disagree with the dots on the page"; it agrees with the dots and disagrees with the pill, which is the number the page actually leads with. `CONTEXT.md` had meanwhile already written down the correct rule — "the worklist count is the number **not completed**, so opening things never makes the number fall". | **Design — and the glossary was right all along** | Seen and Completed merge into a single **Reviewed** state on Around only (ADR 0022); the accent dot goes, and the pointer counts *to work through*, the same number as the pill, by construction. Existing `seen` stamps are abandoned rather than migrated — promoting a glance to "worked through" is a claim the app must not make on a teammate's behalf. On you keeps both axes unchanged. |


### 2026-09-29 — the Conversation drawer on the shared stream

Found building the tracer for
[#1257](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1257), the
first surface moved onto the stream model and component of
[ADR 0033](../adr/0033-one-written-stream-grammar.md), by reading the canvas at
[`threads/`](threads/) against the build and against the page it replaced.
Rows 35 and 36 are checklist lines this PR leaves unmet on purpose; 37 and 38
are places the canvas is silent or disagrees with itself, both since settled.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 35 | **S1** asks for both drawer headers. The Conversation header is now its title alone (S1 as reworded in row 37); the Full-timers drawer still carries the old header ("Full-timers only — how the team is thinking about caring for {name}."), with no lock, and still renders through `Thread.tsx`. | **Design** | Deferred, not disputed: the Full-timers drawer moves onto the stream in [#1258](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1258) with its adapter, and takes its title-with-lock header with it, its audience line moving above its composer. The same holds below 768px, where the contact page's Conversation *tab* is still `Thread.tsx` bubbles: #1258 retires `Thread.tsx` for every contact surface at once. **Resolved in #1258**: the Full-timers drawer, both phone-width tabs, per-Interaction Threads and the Around strip all run on the stream, and `Thread.tsx` is gone. |
| 36 | **G7** is web and phone. This PR builds the web hover toolbar (Reply in thread, Make a to-do, More → Copy text / Delete); the phone's long-press sheet is not touched. | **Design** | **Resolved in #1261/#1262**: the phone's long-press sheet (G7) offers Reply in thread, Make a to-do, Copy text, and Delete for the author or a Full-timer — the web toolbar's actions, phone-shaped. |
| 37 | The canvas drew the Conversation's audience in two places that no single board showed together: `Main.dc.html` put "Everyone tied to Daniel sees this." under the drawer title and **nothing** above the composer, while `Composer.dc.html` put it above the box (and swapped it for "…and can say they followed up." when the ask chip is on). The checklist asked for both (S1 and C3), so #1266 shipped the line twice. | **Composer.dc.html** — the line belongs above the box, where it changes with the kind being written | **Resolved** (settled by the user, Q23): the audience line lives above the composer only. Drawer headers are the stream's title alone — Full-timers keeps its lock icon in the title. S1 in `threads/README.md` is reworded to say so, C3 is unchanged; `Main.dc.html` loses the header subtitle, and `build.py`'s Full-timers drawer drops its header line and gains the locked audience line above its composer. The Conversation drawer's header subtitle is removed in the build. |
| 38 | "Open N days" was counted two ways. The stream counted **calendar days** (an ask raised yesterday at 4:40 PM reads "Open 1 day" the next morning, as `Main.dc.html` draws it); the My Day worklist card (`WorklistCard.tsx`) used `daysOpen` in `threads.ts`, which floored **elapsed 24-hour periods** and so called the same ask "Open 0 days" until 4:40 PM. | **Design** — calendar days | **Resolved** (settled by the user, Q24): calendar days everywhere. `daysOpen` now delegates to the stream model's `calendarDaysOpen` (`src/lib/stream.ts`, mirrored in `packages/core`), so the card and the stream share one helper rather than two formulas; `threadsReach.test.ts` holds an ask raised 20 hours ago, on the previous calendar day, at 1 day in both. An ask raised today still reads "Open since today" in the stream. |

### 2026-09-29 — Your notes on the shared stream

Found building [#1260](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1260),
Feedback Follow-ups on the stream of
[ADR 0033](../adr/0033-one-written-stream-grammar.md), by reading
[`threads/Followups.dc.html`](threads/Followups.dc.html) against the page it
replaced. S6 is ticked.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 39 | `Followups.dc.html` draws "Edited" beside an edited Follow-up, but nothing recorded an edit: `/api/feedback/reply/edit` rewrote `body` and left no mark, so there was nothing for the row to read. | **Design** | The route now stamps `editedAt` and the row says "Edited". Edits made before this change carry no stamp and cannot say it: they are not backfillable, because the old write kept no record of when or whether a reply changed. |
| 40 | The old edit form repeated the public-tracker warning ("Replies are posted to our public issue tracker…") beside its own textarea. The canvas draws it once, under the composer. | **Design** — the composer stays on screen while a row is being edited, so the one line still covers it | The line shows once, under the composer, as the `footer` of the stream. The inline editor carries no second copy. |

### 2026-09-30 — Full-timers, Interaction Threads and the Around strip

Found building [#1258](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1258),
the rest of the contact's written surfaces on the stream of
[ADR 0033](../adr/0033-one-written-stream-grammar.md), by reading
`FT-Drawer`, `Interaction-Thread`, `Around` and `Around-Thread` against the
code they replace. T4 (web), K4, C4, S2 and S3 are ticked.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 41 | `Around-Thread.dc.html` draws the Thread header inside a card on one line — a back arrow, "Thread" and "in Conversation" side by side. The shared stream draws its Thread header as a title over a line ("Thread" / "in Conversation · {name}"), which is what `Drawer-Thread.dc.html` draws and what T3 spells out; the card uses the same header at the compact size. | **Neither — the boards disagree** | Built as one header everywhere (title over the "in …" line), at 13.5px in a card. A one-line variant is a small change in `Stream.tsx` if the card should differ. |
| 42 | No board draws the contact page below 768px. Its Conversation and Full-timers tabs now hold the stream (Full-timers with a lock in its title, its audience line above the box), but the tab picker stays the page's dropdown rather than the phone app's Conversation / Full-timers switch (S7), and an Interaction's Thread covers the page as the drawer does on desktop rather than as a pushed screen (`M-Thread.dc.html`). | **Design** | **Resolved in #1261/#1262**: the phone app ships S7's Conversation / Full-timers switch and the pushed Thread (`M-Thread.dc.html`). Web below 768px gets the grammar, not the phone's navigation. |
| 43 | An Interaction's messages are contact-level threads with `interactionId` set, and a legacy message there can carry its own replies. A Thread is one level deep, so the Interaction Thread shows every message on the Interaction as a reply to it and flattens any legacy nesting; a notification deep-link to an Interaction (`initialInteractionId`) now opens its Thread in the drawer instead of expanding the entry inline. | **Design** — T1 (one level deep) | Built as the checklist says; the data is not migrated, so a legacy nested reply reads as a plain reply. |

### 2026-09-30 — the phone person screen on the shared stream

Found building [#1261](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1261),
the phone's person screen on the stream model of
[ADR 0033](../adr/0033-one-written-stream-grammar.md), by reading
`M-Person`, `M-Person-FT`, `M-Thread`, `M-Story` and `M-LongPress` against the
build. S7 and G7 are ticked, and the phone halves of T4 and K4 (ticked in #1258) are done. Row 36's phone
half is delivered here: the long-press sheet carries Reply in thread, Make a
to-do (the phone's existing "Something to carry" sheet, seeded with the
message), Copy text, and Delete where the stream model allows it.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 44 | **C1** draws a tools row of @, the shortcut hint and send. The phone composer has only send: the phone has never offered @mention candidates on a person, and "⌘↵ to post" means nothing on a touch keyboard (`M-Thread.dc.html` already drops the hint). | **Design** for @; **the build** for the hint | The hint stays off the phone. **Resolved in #1278** for the @: every phone composer now offers ADR 0007's candidates (any teammate on a Conversation, Full-timers only on Full-timers, the members of a chat), the pick inserts the full name, picked mentions reconcile against the body as sent, and removing one drops its notification. |
| 45 | `M-Person.dc.html` draws the audience line under the Conversation / Full-timers switch and a 36px-tall switch. Row 37 settled the audience line above the composer only, and every phone tap target is at least 44px. | **Row 37 and the 44px rule** | Built with the audience line above the composer (with a lock on Full-timers) and a 44px switch. The count sits on the stream you are not reading, as the board draws it. |
| 46 | Staff-only messages were read on the phone from `contacts/{id}/threads` alone, and `@cisa/core`'s thread subscription dropped `scope`, `parentId` and the ask's close fields — so the phone could neither find the Full-timers stream (which lives in `teamThreads`) nor tell a reply or a closed ask from a message. | **Neither — the core data layer had fallen behind the web's** | `@cisa/core` now reads `teamThreads` for a Full-timer (on the effective role), keeps `scope`, `parentId` and `closedBy*`, writes replies and Full-timers messages to the right collection, and gains `closeFollowUpAsk` — mirrors of `src/lib/threads.ts`. No path or rule changed. |

### 2026-09-30 — Messages on the shared stream

Found building [#1259](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1259),
DMs, groups and announcements on the stream of
[ADR 0033](../adr/0033-one-written-stream-grammar.md), by reading
[`threads/A-Messages.dc.html`](threads/A-Messages.dc.html),
[`Announce-FT.dc.html`](threads/Announce-FT.dc.html),
[`Chat.dc.html`](threads/Chat.dc.html) and
[`Composer.dc.html`](threads/Composer.dc.html) against the page they replaced.
G6, C5, S4 and S5 are ticked.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 47 | S4 says a member sees "Reply in thread" on each post; `A-Messages.dc.html` draws a member's posts with Got it and the Thread chip only — a post with no replies has no way into its Thread except the hover toolbar. | **Checklist** — a member reading on a laptop without hovering should still see how to ask about a post | A member's post carries Got it and, while it has no replies, a "Reply in thread" button; once it has replies the chip takes that place. A Full-timer's rows carry the receipt link instead and reach the Thread through the chip or the toolbar, as `Announce-FT.dc.html` draws. |
| 48 | T2 draws the Thread beside the stream at 1440 and says nothing about the widths between that and the phone. | **Neither — the canvas is silent** | Messages puts the Thread beside at 1280px and up (the width at which the full rail, the 328px list, the channel and the 340px pane all fit) and replaces the channel, with back, below that. |
| 49 | The chat pane let the author or a Full-timer take back a parent that still had replies. The stream model forbids deleting a parent whose replies remain (user story 19). | **Design** (ADR 0033) | "Take back for everyone" is offered only on a message with no replies. A take-back is a tombstone, so nothing was ever orphaned, but one rule across every stream is the point of the grammar. |
| 50 | `Chat.dc.html` and `Composer.dc.html` show the chat placeholder as "Message {room}". | **Build, for now** | The placeholders stay "Write a message…" / "Write an announcement…", which the e2e and the rest of the page already use. The hint does follow the canvas: "⌘↵ to send" in a chat, "⌘↵ to post" in an announcement. |
| 51 | S4's strip reads "…until {they} unpin it", and `A-Messages.dc.html` draws "until she unpins it". The app holds no pronouns. | **Build** | The strip says "Pinned by you · stays at the top until you unpin it" for the viewer's own pin and "…until they unpin it" for anyone else's. |

### 2026-09-30 — phone chat and announcements on the shared stream

Found building [#1262](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1262),
DMs, groups and announcements on the phone, by reading
[`threads/M-DM.dc.html`](threads/M-DM.dc.html),
[`M-Announce.dc.html`](threads/M-Announce.dc.html) and
[`M-LongPress.dc.html`](threads/M-LongPress.dc.html) against the build. G3, S5 and
S8 are ticked. A Thread is a pushed screen at `/messages/{roomId}/thread?parent=`.

| # | Drift | Which was right | Resolution |
| --- | --- | --- | --- |
| 52 | `@cisa/core`'s chat data layer had fallen behind the web's, as the thread data layer had (row 46): its message reader dropped `parentId`, `pinned`, `pinnedBy`, `deleted`, `readBy` and `acknowledged`; `sendMessage` could not write a reply or tell the right people about one; and there was no Got it, pin or take-back. | **Neither — the core data layer had fallen behind the web's** | `@cisa/core` now keeps those fields, `sendMessage` takes a `parentId` (preview "in a thread: …"; a reply in an announcement tells the post's author and the Thread's repliers, not the channel), and it gains `acknowledgeAnnouncement`, `togglePinMessage` and `removeMessageForEveryone` — mirrors of `src/services/chat.ts`. No path or rule changed. |
| 53 | The phone deleted a message with `deleteDoc`, which `firestore.rules` refuses (`allow delete: if false` — "a tombstone replaces deletion"), so Delete silently did nothing. | **The rules** | Delete is now the web's take-back: a `deleted` tombstone behind one confirm ("Take this back for everyone?"), shown as "{name} took this message back." and never offered on a parent whose replies remain. Core's unused `deleteChatMessage` is gone. |
| 54 | The web's More menu has Pin / Unpin and Hide from my view. | **Build** — Pin on the phone, deliberately not Hide | Pin / Unpin is in the long-press sheet, and only on an announcement's top-level posts, where the pinned strip exists. **#1279: the phone deliberately won't have Hide from my view.** The web's Hide is a per-message, per-device preference paired with a "Bring it back" note in the desktop channel; the long-press sheet (`M-LongPress.dc.html`) draws neither Hide nor any restore surface, so a message hidden on the phone would be swallowed with no way back. The phone's conversation-level hide already lives in swipe-to-delete ("delete for me"). |
| 55 | The poster's "Read by X of Y · N said got it" receipts link is not on the phone, and the phone does not record `readBy` (#1267 made that web-only). | **Design** (S4) for the receipts; **#1267** for the marking | **Resolved in #1277**: a phone announcement post joins `readBy` when it scrolls into view — the web's rule from #1267, no marking on room load, the same field and data path — and a Full-timer on the phone sees the "Read by X of Y · N said got it" link, opening a read / not-yet list that reads the same `readBy` and `acknowledged` fields as the web's receipts. |
| 56 | C1 draws Attach and @ in the chat box (`M-DM.dc.html`), and C5 stages files and contact cards. The phone composer has only send. | **Design** | **Resolved in #1278**: the phone chat composer's paperclip stages contact cards and the reference reads the phone holds (contacts, gatherings, prayers) above the text, each removable before sending, posted with the message and rendered under it — the same `ChatAttachment` shape the web writes. The @ picker uses the room's members (ADR 0007). |
| 57 | Make a to-do on a chat message has no person to be about. | **Build** | It opens the existing "Something to carry" sheet as "A to-do for the team", seeded with the message, for staff only — a member app has no to-do flow, so a member's sheet omits it. |
| 58 | C3 names an announcement's real audience ("Posting to everyone on Campus"). The phone's room reader does not carry the room's `audiencePreset`. | **Design** (C3, S5) | **Resolved in #1279**: the core room reader carries `audiencePreset`; a Full-timer's announcement composer names the real audience for each preset ("Posting to everyone on Campus — {n} people" / "Posting to {n} people in this channel"), and the chat header reads S5's lines — "Group · N people", "Announcement · N people · {names} post here", "Just the two of you" — through a `chatRoomSubtitle` mirror kept in step with the web by a parity test. |
| 59 | The loading skeleton still alternates bubbles left and right. | **Design** (G3) | **Resolved in #1279**: the chat loading skeleton's placeholders are all left-aligned, like the rows they stand in for. |
