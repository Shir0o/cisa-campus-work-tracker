# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **Primary users**:
  - **Full-timers (`admin`)**: Campus ministry staff directors and ministers with team-wide oversight, administrative configuration access, gospel partner pairings, gathering rosters, and full data visibility.
  - **Trainees (`manager`)**: On-campus field workers who go out to meet students, manage assigned contacts, log interactions, join The Journey board, and work in Gospel Partnerships.
- **Secondary audiences**:
  - **Student leaders (`operator`)**: Student leaders with access to the People directory, campus gatherings, Bible study reader, and prayer requests.
  - **Community partners (`viewer`)**: Ministry supporters and community members with read access to shared prayer requests, gatherings, and team announcements.

## Product Purpose

CISA Campus Work Tracker equips collegiate ministry teams to steward relationships with college students across campus outreach, follow-up, and discipleship. The product tracks real-life encounters, coordinates gospel partnerships, organizes Bible study gatherings and rhythms, maintains personal and shared prayer burdens, and closes feedback loops between on-campus field workers and ministry leadership. Success means no student is forgotten, workers collaborate transparently without administrative burden, and relational care takes precedence over bureaucratic tracking.

## Positioning

Unlike conventional sales CRMs, church management databases, or generic task trackers that treat people as lead funnels or ticket queues:
- **Gospel Partners**: Pairs of trainees go out together on campus; contacts they meet are co-founded (`founders`) and permanently shared from the moment they are logged.
- **The Journey**: Visualizes spiritual milestones and relational stages rather than transactional sales stages.
- **Relational care over task obligations**: Follow-up asks are open invitations and shared questions rather than assigned tickets with deadlines.
- **Bespoke campus ministry rituals**: In-situ Bible study reader with Entry points, passages, prompts, and blanks; gathering rosters with recurring rhythms; and prayer burdens that distinguish personal carrying from team archiving.

## Operating Context

- **On-campus fieldwork**: Trainees and ministers walking campuses, meeting students between classes, showing Bible study QR codes on phones in classrooms or lounges (Present mode), and logging interaction notes on mobile devices.
- **Weekly team coordination**: Reviewing The Day's Goal, checking "On you" attention feeds, coordinating care across contacts, and reviewing prayer burdens during staff meetings.
- **Gatherings & Bible studies**: Weekly rhythms (e.g., Wednesday Bible Study, Thursday College Meeting, Welcome BBQs) driven by durable Entry point slugs (`/s/cisa-wednesday`) resolving to weekly published Meetings read directly on student phones.
- **Feedback & Notes loop**: Direct submitter notes ("Tell us how it's going") mirrored to GitHub issues and back, with "What came of it" notifications and canned responses.

## Capabilities and Constraints

- **Capabilities**:
  - **People & Directory**: Contact profiles, stages on The Journey, founders, contact tags, word-boundary directory search, interaction history, conversation streams, and staff-only notes.
  - **Gatherings & Attendance**: Rhythm cadences, weekly Gatherings, roster management (Full-timer restricted), walk-in tracking, and staged one-way Attendance Sync Intake (`attd`).
  - **Bible Studies**: Entry points, term Studies, weekly published Meetings, Section movements (Passage, Verse, Key line, Prompt, Blank), and Present mode.
  - **Prayer List**: Personal prayer burdens, team prayer requests, and hidden/archived distinction.
  - **Notifications & Deep Linking**: In-app bell alerts and OS push notifications deep-linking to contacts, chat rooms, and team questions.
  - **Security & Multi-Factor Auth**: Role-based permissions (`admin`, `manager`, `operator`, `viewer`), mandatory second factor (authenticator app) for Full-timers and owners, and two-phase test account purge for app store reviewer accounts.
- **Stack & Architecture**:
  - Web: React 19 SPA, Vite, Tailwind CSS, Express backend API server (`server.ts`).
  - Mobile: Native iOS and Android application via React Native and Expo SDK (`apps/mobile/`).
  - Shared domain: `packages/core` for platform-agnostic business logic, types, and permissions.
  - Backend services: Cloud Firestore, Firebase Auth, Firebase Storage, and Firebase Local Emulator Suite.
- **Terminology Invariants**:
  - Canonical product name: "CISA Campus Work Tracker".
  - Canonical terms: Full-timer, Trainee, Gospel Partners, The Journey, The Day's Goal, Gathering, Rhythm, Meeting, Study, Entry point, Section, Passage, Verse, Key line, Prompt, Blank, Follow-up ask, Conversation. Forbidden terms: CRM, tickets, leads, quota, intern, superuser, buddy.

## Brand Commitments

- **Tone & Voice**: Warm, sober, relational, supportive, and unpretentious; free from corporate sales jargon or gamified pressure.
- **Design System Tokens**: Monotonic border radius scale (Shell 32px, Card 24px, Sub-container 20px, Nested panel 14px, Control 10px; no lozenge inputs), high-contrast distinct interactive `--accent` with persistent underlines for links.
- **Bilingual Commitment**: English and Spanish support across core help and orientation surfaces (ADR 0035).

## Evidence on Hand

- Canonical glossary and domain model in [`CONTEXT.md`](CONTEXT.md).
- Architectural Decision Records in `docs/adr/` (ADR 0009 border radius, ADR 0010 reactive first-run checklists, ADR 0029 mandatory 2FA, ADR 0031 notifications, ADR 0035 bilingual help).
- Production web application in `src/` and native mobile application in `apps/mobile/`.
- Security rules and query contracts in `firestore.rules` and `src/test/queryContract.test.ts`.
- Absence note: No marketing landing page or public promotional web surface exists; the application is an authenticated, access-gated tool for ministry workers and students.

## Product Principles

- **Relational care over bureaucratic tracking**: Features prioritize shepherd-care and personal burden, avoiding gamification, pressure quotas, or rigid task assigning.
- **Shared ministry in partnership**: Gospel partners co-own contacts from creation; work is communal and transparent among teammates rather than siloed.
- **In-situ and unobtrusive**: Whether showing a QR code in a noisy room or logging a conversation between classes, the UI must be fast, legible, and immediately responsive.
- **Adaptive integrity across surfaces**: Web SPA and native mobile app share domain logic, terminology, and permissions while respecting platform-native interaction ergonomics (HIG on iOS, Material 3 on Android).
- **Honest status and truthful feedback**: Onboarding derives reactively from real data; feedback notes provide clear outcomes and truthful "What came of it" statements.

## Accessibility & Inclusion

- WCAG AA color contrast standards across all themes and dark/light appearances.
- High-contrast interactive text signal: `--accent` token must remain distinctly legible against surface, backed by persistent underlines for links.
- Monotonic radius hierarchy and touch target minimums (44×44 pt on iOS, 48×48 dp on Android).
- Bilingual accessibility with English and Spanish language options.
