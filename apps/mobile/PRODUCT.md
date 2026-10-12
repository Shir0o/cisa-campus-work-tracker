# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **Primary users**:
  - **Trainees (`manager`)**: On-campus field workers using mobile devices during campus outreach to work through their daily queue (`FocusCard`), log student encounters (`LogSheet`), manage Gospel Partner contacts, and advance contacts along The Journey.
  - **Full-timers (`admin`)**: Ministry leaders using the mobile FT Widgets dashboard (`FtHomeScreen`) for quick team oversight, glance statistics, urgent prayer burdens, and question answering in the field.
- **Secondary audiences**:
  - **Student leaders and community members (`operator` / `viewer`)**: Using the member shell (`MemberHomeScreen`) to track upcoming campus gatherings, hospitality homes, and personal prayer lists.

## Product Purpose

CISA Campus Mobile delivers the handheld field companion for collegiate campus ministry. Optimized for mobile outreach, it allows workers to rapidly log encounters immediately after conversations, work through the daily contact queue one card at a time, review gospel partnerships, and stay coordinated through real-time notifications—all without requiring a laptop.

## Positioning

Unlike complex desktop CRMs, the mobile app is built for walking the campus:
- **Focused Daily Queue**: Trainees experience their day through a linear, focused Queue (`FocusCard`) rather than multi-column desktop boards.
- **Role-Tailored Shells**: Dedicated mobile experiences for each role (Trainee Queue, Full-Timer Glance & Widgets, and Member Rhythm Feed).
- **In-Situ Action Sheets**: Fast bottom sheets (`LogSheet`, `MoveStepSheet`, `ReplySheet`) that allow logging and updates in seconds with minimal tapping.
- **Field-Ready Design**: High contrast for outdoor sunlight, minimum 44pt touch targets, and offline-resilient local caching.

## Operating Context

- **Active Campus Outreach**: Walking campus outdoors between buildings, meeting students in dining halls, student unions, and campus greens.
- **Fast Encounter Logging**: Immediately capturing impressions, contact info, and tags right after talking to a student.
- **Push Notification Triage**: Responding to OS push notifications for @mentions, new assigned follow-up asks, and prayer requests.
- **Bible Studies & Gatherings**: Scanning or displaying Entry point QR codes in rooms and marking gathering attendance on mobile.

## Capabilities and Constraints

- **Capabilities**:
  - Mobile Shells: Role-adaptive navigation (`QueueScreen`, `FtHomeScreen`, `MemberHomeScreen`).
  - Gesture-Driven Sheets: Bottom sheets via `@gorhom/bottom-sheet` for logging interactions, moving stages, and leaving feedback notes.
  - Offline & Push: `@react-native-async-storage/async-storage` for local caching; `expo-notifications` for deep-linked push notifications.
  - Testing & Deployment: Maestro E2E mobile test suite (`.maestro/`); EAS build pipelines for iOS App Store and Android Google Play.
- **Technical Stack**:
  - React Native 0.76+, Expo SDK 54, Expo Router v6 (`app/`), TypeScript.
- **Ergonomic Invariants**:
  - Minimum touch target: 44×44 pt on iOS, 48×48 dp on Android.
  - Card footer never scrolls; only the card interior body scrolls.
  - No text ink lighter than the layer floor (`ink3`).
  - System back gesture and safe-area insets must remain unimpeded.

## Brand Commitments

- **Tone & Voice**: Warm, direct, relational, and unpretentious; identical terminology to canonical `CONTEXT.md` (Gospel Partners, The Journey, Follow-up ask, The Day's Goal).
- **Design Alignment**: Clean mobile layout respecting native platform idioms (HIG on iOS, Material 3 on Android).

## Evidence on Hand

- Shipped mobile codebase in `apps/mobile/src/` and routes in `apps/mobile/app/`.
- Mobile theme contracts in `apps/mobile/src/theme/tokens.ts` and `apps/mobile/src/theme/v2.ts`.
- Maestro E2E test flows in `apps/mobile/.maestro/`.
- Documentation in `apps/mobile/README.md`, `SETUP.md`, and `BUILD_AND_SUBMIT.md`.

## Product Principles

- **One-Thumb Field Ergonomics**: Core outreach actions (logging encounters, checking off queue items) must be effortlessly reachable with one hand while on the move.
- **Role-Specific Simplicity**: Trainees get a streamlined queue; full-timers get a compact widget glance; students get an uncrowded gathering feed.
- **Fast In-and-Out Interactions**: Logging an encounter takes seconds, keeping workers focused on the people in front of them rather than screens.
- **Native Platform Integrity**: Strictly honor system navigation gestures, safe area insets, Dynamic Type / font scaling, and dark mode.

## Accessibility & Inclusion

- Responsive font scaling (`v2FontScale`) adapting smoothly to device height and system font settings.
- Strict touch target floors (44×44 pt minimum).
- High-contrast text guarantees enforced by theme layer ink floors (`ink3`).
- Full light and dark appearance support matching OS appearance.
