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

