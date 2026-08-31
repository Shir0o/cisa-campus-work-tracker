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
