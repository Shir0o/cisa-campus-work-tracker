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
Permanently deleting a logged conversation from a contact's Conversations (web) / Story (mobile) log. Restricted to the person who logged it or a Trainee/Full-timer; reversible for a short window via Undo, after which the deletion and its History entry commit. Removing does not rewrite the contact's last-contacted stamps, and interaction-created to-dos keep their source link.
_Avoid_: Archive entry, trash a conversation

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

**In-app Notification**:
An alert delivered to the notification bell in the top navigation bar (and optionally mirrored as an OS push notification) informing a user of assigned to-dos, trainee activity on contacts, answered questions, or chat messages. Clicking a notification deep-links directly to the target item (the contact at `/people/:contactId`, the chat conversation at `/messages/:roomId`, or team questions at `/questions`).
_Avoid_: Bell popup, system toast, activity blast

**Edit a contact (Mobile & Web PWA)**:
Updating a person's core profile details (name, phone, email, Instagram, how we met, address/location, role/affiliation, first impressions/notes, and tags). Available to all authenticated write roles (Trainees and Full-timers, `role !== 'viewer'`) across native mobile (`EditContactSheet`), responsive web PWA, and desktop (`ContactDetailsModal`). Moving stage is decoupled and handled by the dedicated Move Step sheet, while caregiver assignments follow gospel partner ownership rules.
_Avoid_: Admin edit form, contact manager modal

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
