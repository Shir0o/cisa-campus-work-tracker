# Changelog

A distilled history of notable changes to CISA Campus Work Tracker, newest first.
This project is not version-tagged; entries are grouped by month. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/) (Added / Changed / Fixed).

## [Unreleased]

### Added
- Added **Walking-together threads** — a lightweight conversation between a trainee and the full-timer walking with them, attached to a contact and (optionally) to one logged interaction. New Firestore-backed `contacts/{id}/threads` subcollection with five message kinds (note / question / comment / encouragement / nudge) and per-message reactions; a reusable `<Thread>` component reusing the History/notification tonal-node look; a **"Walking with {trainee}"** tab on the contact profile (with a live message count) plus a **"Walk through this together"** toggle that expands an inline thread under each interaction. The compose kinds shift by who's viewing (trainee vs. full-timer). Also added the data layer for the upcoming My Day inbox: a full-timer↔trainee relationship config (`FT_TRAINEES`/`FT_OF`), a per-user localStorage inbox read-state store, an `inboxItemsFor` feed derivation, a `reviewed` flag on contacts, and matching Firestore rules. No "mentor" language anywhere.
- Made the home route (`/`) a **role-based landing**: Full-timers get the **My Day** cockpit, while Trainees (your caseload + the prayers you're carrying), Students (upcoming gatherings + friends to pray for), and Community members (open gatherings + a way to reach a Full-timer) each get a tailored home. Built real **event RSVP** (`events/{eventId}/rsvps/{uid}`, with a `setRsvp`/`subscribeEventRsvps`/`subscribeMyRsvps` lib and matching Firestore rules) — members RSVP from their landing and staff see a read-only "going" count on the Attendance "Coming up" list. Community "Reach out" opens a direct message to a Full-timer (with a `mailto:` fallback). Extracted the shared My Day building blocks (avatar, stage chip, section head, prayer rows, reach card, personal-prayer composer) into `src/components/landing/` for reuse.
- Reworked the **My Day** page to the updated design: two-tier to-dos (read-only "Assigned to you" team to-dos with a "From [doc]" tap-through vs. fully-editable personal tasks, plus an inline composer); a "Your contacts" picker persisted to a new `userPreferences/{uid}` doc; corporate-prayer status controls (with a "→ Prayer Log" link) plus private, fully-editable personal prayers (new `users/{uid}/personalPrayers` collection) that can be optionally tagged to a contact; an SMS/Google-Messages "Message" contact action; and a richer "Your week" featured card. Added Firestore rules for the two new per-user collections.
- Expanded unit-test coverage for core components and views, targeting `ContactDetailsModal.tsx` (blur validation, contact edit/delete, comment replies, and history), `Sidebar.tsx`, `Directory.tsx`, and `PrayerList.tsx` to cover async state changes and lifecycle events. Ratcheted the Vitest coverage thresholds to the new baselines (83% lines, 81% statements, 75% functions, 69% branches) to prevent regressions.
- Enforced unit-test coverage thresholds in CI by adding pragmatic exclusions, improving test coverage of views/modals (e.g. `Attendance`, `SignUp`, and `AddEventModal`), and ratcheting the Vitest thresholds to the new baseline (~79.5% lines) (#62).
- Unit test coverage for layout and modal components: `App`, `TopBar`, `NotificationCenter`, `AddEventModal`, `LogInteractionModal`, `SyncSheetModal`, and `ContactDetailsModal`, boosting overall line coverage to over 74% (#61).
- Unit test coverage for core views: `Directory`, `PrayerList`, `Attendance`, `History`, `SignUp`, and `FeedbackList`, boosting overall line coverage from ~39% to over 50% (#59).
- Unit test coverage for large views: `Settings` (Quick Add, Webhook console logs, role & membership updates) and `OutreachBoard` (stage creation, edits, deletion), boosting overall line coverage to over 63% (#60).
- `CHANGELOG.md` — distilled project history backfilled from git/PR log.

### Changed
- Removed the stale in-repo `docs/design/project` "Field Notes" design bundle; the design source now lives in the external Claude Design handoff zip, so the repo no longer carries a duplicate that drifts out of date.
- Removed the generic **"Today"** dashboard and the separate admin-only `/my-day`
  route in favor of the single role-based home at `/` (My Day is now served at
  `/` for Full-timers). The home nav item is role-aware ("My Day" for Full-timers,
  "Home" otherwise).
- Reskinned the feedback FAB + `/feedback` page to the warm Field Notes "Leave a
  note" panel — four note kinds (A thought / An idea / Something's off / A
  request), ⌘↵ to send, persona footer, and a "We got your note." success state.
  Kinds are now stored (new `kind` field) and surfaced in the admin feedback
  inbox; existing submissions fall back to their `type` (#21).
- `CLAUDE.md` is now gitignored, and the worktree-sync hook mirrors it into git
  worktrees on session start so project instructions follow each worktree (#39).

### Fixed
- The Board's Markdown formatting toolbar no longer disappears when scrolling a
  long page: the editor workspace now has a bounded height on desktop
  (`lg:h-[calc(100vh-6rem)]` + `lg:grid-rows-1`), so the page list and document
  canvas scroll internally and the `sticky` toolbar stays pinned (#65).
- Vitest configuration to exclude `.claude/**` subagent worktrees, preventing test suite conflicts.
- Mocking setup in `OutreachBoard` tests to prevent loading real Firebase RTDB services under unit tests.
- The Board live collaboration no longer fails with RTDB `permission_denied`:
  broadened the `board_docs_rtdb` rule to any signed-in, email-verified user
  (the previous rule required an `admin` custom claim the app never sets, so
  Firestore-role admins were denied), and added CI auto-deploy for
  `database.rules.json` so RTDB rule changes actually reach the live project.

## [2026-06] — Field Notes design system, RBAC & CI

### Added
- Role-based access control enforced across routes and navigation (#3).
- CI workflow with a 90% test coverage threshold (#6).
- Coordination notes collection with Markdown editing and archive support.
- Global ⌘K search with a unified command palette (#37).
- "My Day" full-timer cockpit view (#36).
- Notifications "What's stirring" view (#38).
- PR Agent workflow and CODEOWNERS.

### Changed
- "Field Notes" warm design reskin rolled out across every surface: foundation
  tokens & fonts (#25), app shell / sidebar / nav relabel (#26), Today/Dashboard
  (#27), The Journey/Outreach Board (#28), People (#31), Gatherings/Attendance
  (#33), Prayer (#32), Looking Back/History (#34), and Settings (#35).
- Restored RBAC / CI / E2E setup after an AI Studio regeneration (#23).

## [2026-05] — Productionization, AI & integrations

### Added
- User feedback system, with the feedback list surfaced in Settings.
- Server-side Gemini processing with a webhook proxy and logging system.
- Serverless functions bundled into the build and Docker image.
- AI-powered interaction parsing.
- GroupMe bot parsing cheat sheet in Settings.
- Google Sheets integration and attendance export (with dry-run summary).
- Prayer tracking feature.
- Notifications collection and Firestore rules.
- Signup enhancements: residence hall and spiritual-background fields,
  client-side validation, and anti-bot measures.
- Theming, skeleton loading states, and an ErrorBoundary component.

### Changed
- Renamed the app to **CISA Campus Work Tracker**.
- Reworked activity/interaction tracking and added nested comments.
- Added AI-powered activity summarization on the dashboard.

### Fixed
- Standardized date formatting with date-fns.

## [2026-04] — Foundation & core CRM

### Added
- Firebase authentication with user approval and admin access control.
- PWA features and mobile navigation.
- Collapsible sidebar with persisted state.
- Contact directory and New Contact modal with configurable workflow stages.
- Outreach Board (Kanban) with drag-and-drop between stages.
- Events collection with recurring events and a reusable DatePicker.
- User roles & permissions, an invitation system, and Firestore security rules.
- Real-time dashboard with metrics and a time-based greeting.
- System activity logging.

### Changed
- Branding evolved from OutreachPro to CampusHub.
