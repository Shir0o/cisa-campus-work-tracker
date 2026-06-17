# Changelog

A distilled history of notable changes to CISA Campus Work Tracker, newest first.
This project is not version-tagged; entries are grouped by month. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/) (Added / Changed / Fixed).

## [Unreleased]

### Added
- Enforced unit-test coverage thresholds in CI by adding pragmatic exclusions, improving test coverage of views/modals (e.g. `Attendance`, `SignUp`, and `AddEventModal`), and ratcheting the Vitest thresholds to the new baseline (~79.5% lines) (#62).
- Unit test coverage for layout and modal components: `App`, `TopBar`, `NotificationCenter`, `AddEventModal`, `LogInteractionModal`, `SyncSheetModal`, and `ContactDetailsModal`, boosting overall line coverage to over 74% (#61).
- Unit test coverage for core views: `Directory`, `PrayerList`, `Attendance`, `History`, `SignUp`, and `FeedbackList`, boosting overall line coverage from ~39% to over 50% (#59).
- Unit test coverage for large views: `Settings` (Quick Add, Webhook console logs, role & membership updates) and `OutreachBoard` (stage creation, edits, deletion), boosting overall line coverage to over 63% (#60).
- `CHANGELOG.md` — distilled project history backfilled from git/PR log.

### Changed
- Reskinned the feedback FAB + `/feedback` page to the warm Field Notes "Leave a
  note" panel — four note kinds (A thought / An idea / Something's off / A
  request), ⌘↵ to send, persona footer, and a "We got your note." success state.
  Kinds are now stored (new `kind` field) and surfaced in the admin feedback
  inbox; existing submissions fall back to their `type` (#21).
- `CLAUDE.md` is now gitignored, and the worktree-sync hook mirrors it into git
  worktrees on session start so project instructions follow each worktree (#39).

### Fixed
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
