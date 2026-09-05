# CISA Campus Work Tracker

A web and mobile application for full-time campus ministers, trainees, students, and community partners to track campus ministry contacts, follow-up interactions, prayer burdens, gatherings, and administrative configurations.

**CISA Campus Work Tracker**:
The canonical name of the product — the web app, mobile app, and user-facing copy all use this spelling. The misspelling `traker` is retired: the repo, GitHub, and Cloudflare Pages domains were renamed in 2026-08.
_Avoid_: Traker, CampusHub, OutreachPro

**Gospel Partners**:
Two (or three) trainees paired together for a term/semester who go out together on campus. Contacts created by either partner are automatically shared with the other (`coCreators`).
_Avoid_: Companion, buddy, accountability partner

**Full-timer**:
The administrative staff role (`admin`) with team-wide oversight, administrative settings access, gospel partner configuration, and full data access.
_Avoid_: Superuser, admin user, staff manager

**Trainee**:
The field worker role (`manager`) who manages assigned contacts, joins The Journey board, and participates in term gospel partnerships.
_Avoid_: Intern, field manager

**The Day's Goal**:
A shared target number of new campus connections to make on an on-campus day, configured globally by Full-timers in Settings.
_Avoid_: Quota, target metric, daily KPI

**QA Database (`qa-db`)**:
The dedicated non-production Firestore database instance in the `sac-campus-hub` project used for E2E tests and staging validation.
_Avoid_: Test database, sandbox Firestore, staging db

**Feedback Note ("Tell us how it's going")**:
An in-app note (categorized as a thought, an idea, something off, or a request) submitted directly by mobile or web users to campus administrators.
_Avoid_: Bug ticket, customer support issue, help desk ticket
**Remove an interaction**:
Permanently deleting a logged conversation from a contact's Interactions log (called that on both web and mobile; mobile's "Story" was retired for it). Restricted to the person who logged it or a Trainee/Full-timer; reversible for a short window via Undo, after which the deletion and its History entry commit. Removing does not rewrite the contact's last-contacted stamps, and interaction-created to-dos keep their source link.
_Avoid_: Archive entry, trash a conversation

**Remove from prayer list**:
Taking a person off `/prayer` — the row menu's destructive action on the web card, the × on the mobile card. It hides them from *your* page only: the id joins the `cisa.prayer.hidden` set in that browser's local storage, the same bookkeeping "Choose people" does when you untick a name. Nothing is deleted and no teammate's page changes; Undo puts them straight back. Distinct from **Archived**, which is a mark on a single prayer, not something you do to a person (#714, #715).
_Avoid_: Archive from prayer list, unhold, stop carrying

**Global Search (⌘K)**:
The desktop search palette that opens the do-everything navigation: jump to any destination, find a person, conversation, coordination note, or history entry, and run quick actions — role-filtered and ranked by frecency. ⌘K (Ctrl+K on other keyboards) opens it from anywhere; on mobile a search button opens the same palette full-screen. In rail mode the palette is mounted by the shell above the content; in top-bar mode it sits inside the bar; the keyboard shortcut is identical in both shells.
**Questions for the team**:
The Full-timer destination for trainee questions that aren't about one person, at `/questions`. My Day's "Questions for the team" stack is a summary that points here — answering happens in exactly one place, on the page's question cards.
_Avoid_: Ask the team board

**`--accent` (CSS token)**:
The interactive-text signal — links, clickable names, and `hover:text-*`
affordances resolve to it via the Tailwind utility. Invariant: in every
theme, `text-accent` must render visually distinct from `text-on-surface`,
otherwise interactive text reads as plain body and links go invisible.
Defence-in-depth: interactive text also carries a persistent `underline
underline-offset-2` so the affordance holds even if the colour signal
ever drifts back to equality with `--text`. If you find yourself tempted
to flatten `--accent` toward `--text` for visual consistency, re-introduce
headroom instead — the regression test in `src/test/accentToken.test.ts`
will fail otherwise.

**First-Run Checklist (Getting started card)**:
The role-aware onboarding card (`FirstRunCard`) on the home screen and role landings. Each step is reactively derived from live records — contacts added, conversations logged, questions asked, prayers offered — never manually ticked, so the card always tells the truth about progress. Shows an accessible progress meter and an "X of Y complete" count; dismissed with "Put this away" (persisted per user + role in localStorage) and restored from Settings > Getting started. It disappears quietly once every step is done (ADR 0010 — reactive in-situ checklists, no overlay tours).
_Avoid_: Onboarding tour, walkthrough, tutorial overlay

**Border Radius Scale (CSS tokens)**:
The monotonic scale governing corner curvature across the application: Shell container 32px (`--radius-2xl`), Cards/Modals 24px (`--radius-xl`), Sub-containers 20px (`--radius-lg`), Nested panels 14px (`--radius`), Form inputs/controls 10px (`--radius-sm`), and Pills/Avatars (`rounded-full`). Invariant: nested elements must descend in radius (Card 24px → Panel 14px → Control 10px), and controls must never clamp to lozenges/stadiums (ADR 0009).
_Avoid_: Arbitrary px radii on inputs, lozenge inputs


**In-app Notification**:
An alert delivered to the notification bell in the top navigation bar (and optionally mirrored as an OS push notification) informing a user of assigned to-dos, trainee activity on contacts, answered questions, or chat messages. Clicking a notification deep-links directly to the target item (the contact at `/people/:contactId`, the chat conversation at `/messages/:roomId`, or team questions at `/questions`).
_Avoid_: Bell popup, system toast, activity blast

**Edit a contact (Mobile & Web PWA)**:
Updating a person's core profile details (name, phone, email, Instagram, how we met, address/location, role/affiliation, first impressions/notes, and tags). Available to all authenticated write roles (Trainees and Full-timers, `role !== 'viewer'`) across native mobile (`EditContactSheet`), responsive web PWA, and desktop (`ContactDetailsModal`). Moving stage is decoupled and handled by the dedicated Move Step sheet, while caregiver assignments follow gospel partner ownership rules.
_Avoid_: Admin edit form, contact manager modal

**Edit a teammate**:
Updating an app user's display name or role under Settings > Your team. Restricted to Full-timers (`isAdmin`). Distinct from editing a contact's profile details.
_Avoid_: Edit user profile, rename user


**Gathering Roster**:
The defined cohort of people expected to attend a specific gathering or recurring series (`Event.roster`). Defaults to empty rather than defaulting to the entire contact database. Only roster members are tracked under "We missed" if absent; walk-ins can be marked present, integrated into the roster going forward (without retroactive absence penalties), or created on the spot by name. Roster management is restricted to Full-timers (`isAdmin`).
_Avoid_: Member pool, invite list, attendance group

**Study**:
A Bible study series that runs over a term — the named arc ("Romans, Fall 2026") that a set of Meetings belongs to. Distinct from the "Bible study" option a student picks under "What are you drawn to?" at sign-up, which is an interest, not this.
_Avoid_: Course, curriculum, series, Bible study (bare)

**Meeting**:
One week's Bible study document — the outline, readings and prompts for a single gathering, and the thing a single QR code opens. A Meeting is what a student reads on their phone; it is not the gathering's attendance record. When a Study splits its room into two, that week is two Meetings sharing an opening and a closing.
_Avoid_: Session, lesson, week, class

**Section**:
One movement of a Meeting: some outline points, a Passage, and a Prompt. Sections are the visual and structural unit a Meeting is read in — every part of one is optional and their order is however the author wrote it.
_Avoid_: Slide, step, chapter, block

**Passage**:
The portion of scripture a Section is built around, shown in full on the page rather than cited for the reader to look up elsewhere.
_Avoid_: Verse, reading, scripture reference, excerpt

**Prompt**:
The part of a Section that puts something to the room, in one of three kinds — **Question** (answered), **Discuss** (opened up), **Activity** (done). Prompts are for the people in the room to work through out loud; the page never collects an answer to one. Unrelated to "Questions for the team" at `/questions`, which is trainees asking Full-timers.
_Avoid_: Question (bare), exercise, discussion question, application

**Blank**:
A word hidden in a Section's outline points or Passage that a reader taps to reveal — the fill-in-the-blank device, used to interrupt passive reading. Whether a Meeting uses Blanks at all is the author's choice, per Meeting.
_Avoid_: Cloze, fill-in, hidden word, quiz

**Gathering**:
One occasion the team comes together and takes attendance for — a single Wednesday Bible Study, one Thursday College Meeting, a Welcome BBQ. A Gathering carries who was there and who was expected. It is not the document anyone reads in the room (that is a Meeting), and it is not the arc it belongs to (that is a Rhythm, or a Study).
_Avoid_: Session, event, occurrence

**Rhythm**:
A Gathering that repeats on a fixed cadence — the Wednesday Bible Study, the Thursday Bible Study, the Thursday College Meeting. A Rhythm owns the name, kind, cadence, location and the expected roster; each turn of the cadence produces one Gathering, and a Gathering may override the roster for its week alone. A Study may be taught on a Rhythm, but the two are not the same thing: College Meeting is a Rhythm with no Study, and a Study's Meetings are documents rather than attendance records.
_Avoid_: Series, recurring event, schedule, repeat

**Attendance taken**:
The fact that someone recorded who was at a Gathering — as distinct from a Gathering nobody has opened yet. Without it, "we held it and nobody came" and "nobody has got to this one" are the same empty answer, so the record says explicitly that a person marked it and when.
_Avoid_: Marked, complete, closed

**Full-timers (contact tab)**:
The Full-timers-only thread on a contact, where staff reason together about how to care for that person. It is one of the tabs on the contact detail page and is not visible to Trainees. The tab is named for its audience on purpose: it sits beside **Conversation**, which is open to everyone tied to the contact, and the label is the only thing telling a Full-timer which of the two a Trainee can read. Formerly titled "Discussion", which said nothing about who could see it.
_Avoid_: Discussion, Private, Comments, internal thread, chat

Three other things in this product carry the word and are not this: a **Prompt** of kind *Discuss* is what a Bible study Section puts to the room; **Questions for the team** at `/questions` is Trainees asking Full-timers something that isn't about one person; and a **Coordination note** is neither.

**Mention**:
Explicitly tagging a teammate in a Conversation thread, the Full-timers tab, or a chat message using `@DisplayName`. Emits a direct notification to that teammate's notification bell, system push notifications (if enabled), and surfaces under their My Day "On you" Attention Feed stack. In team-scope Discussions, mentions are strictly restricted to Full-timers.
_Avoid_: Tag, ping, callout

**Test Account Purge**:
An administrative action available to Full-timers in Settings that scrubs non-person test accounts (matching `reviewer*` or `cisa*` emails, or service/review account display names) and their associated traces (invitations, personal prayers, and interaction logs on contacts) across the system. It uses a two-phase dry-run scan and confirmation flow to prevent accidental data loss.
_Avoid_: Reset database, wipe users, factory reset




**Follow up**:
Texting or emailing a contact after the first encounter — or, less often, doing the thing a Trainee promised them. An act directed at the *person*, and the only thing the phrase means. Replying to a teammate in the app is not following up, however much it looks like closing a loop; the two were conflated because the contact's staff thread used to be titled "Follow-up" (it is now **Conversation**).
_Avoid_: Replying, responding, chasing, touching base

**Follow-up ask**:
One staff member saying a **Follow up** wants doing, written into a contact's **Conversation** thread. It reaches everyone tied to that contact, carries no owner and no deadline, and stays open — showing how long it has been open as a plain fact — until someone tied presses "I followed up" or the asker retracts it with "Never mind". Deliberately *not* a to-do: a to-do is a personal list with an assignee, and putting someone else's name and date on an errand creates an obligation this is meant to avoid. Nothing closes it implicitly — not logging an Interaction, not replying in the thread.
_Avoid_: Nudge, reminder, assigned follow-up, task

**Conversation (contact tab)**:
The staff thread on a contact, open to everyone tied to that person, where a Full-timer asks a question, a teammate answers, and a **Follow-up ask** is raised. Formerly titled "Follow-up", which named an act toward the contact rather than a place staff write. Distinct from **Interactions**, the log of actual contact with the person, and from the **Full-timers** tab, which is the same kind of thread restricted to staff.
_Avoid_: Follow-up, Thread, Comments, Walking together

**Tied to a contact**:
The four relationships that make someone a recipient of what is written on a person: they added them, they are the adder's gospel partner (`coCreators`), they are the assigned caregiver (`owner`), or they keep that person on their own My Day. The first three live on the contact document and can be resolved by whoever is posting; the fourth is private to each teammate and is resolved on the reader's own screen instead. Everything written in a **Conversation** reaches all four unless an `@mention` narrows it to one person.
_Avoid_: Stakeholder, watcher, subscriber, assigned

**Seen / Completed**:
The two independent things a person records about an item in their My Day worklist. **Seen** is passive — you opened the contact — and shows as the unread dot. **Completed** is deliberate: *Reviewed* for something you only had to look at, *I followed up* or *Answered* for something you owed someone, *Got it* for information. The worklist count is the number **not completed**, so opening things never makes the number fall. Both are per person and stored server-side, so they agree across someone's phone and laptop.
_Avoid_: Read/done, scanned, dismissed, cleared, archived

**What's New Announcement**:
An in-app modal presented to users upon launching an updated web PWA or mobile build, highlighting user-facing changes and improvements for that release. Backed by markdown manifests in `content/whats-new/` compiled into static manifests, tracking the latest seen release ID locally on each device, and always re-accessible via Settings.
_Avoid_: Release popup, changelog blast, splash alert

