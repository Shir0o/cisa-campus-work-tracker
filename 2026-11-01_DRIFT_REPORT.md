# EGM Drift Report (2026-11-01)

Repository documentation drift report validating contracts against current codebase implementation, specifically enforcing architectural separation between the **website version** (`src/`, React 19 / Vite SPA) and the **mobile native version** (`apps/mobile/`, React Native / Expo SDK), with shared domain logic in `@cisa/core`.

---

## README.md (Root Blueprint)
No drift detected.
- Correctly models the four canonical roles (`admin`, `manager`, `operator`, `viewer`) per `CONTEXT.md`.
- Accurately details Express backend interfaces (`createApp`, 100 req/5m standard rate limiter, 50MB body limit) in `server.ts`.
- Accurately describes platform partitioning between the website SPA (`src/`), native mobile application (`apps/mobile/`), and platform-agnostic core (`packages/core/`).

## apps/README.md
No drift detected.
- Accurately identifies `apps/mobile` as the cross-platform native iOS and Android application.

## apps/mobile/README.md (Native Mobile Application)
No drift detected.
- Correctly specifies native entry points (`RootNavigator`, `PUBLIC_ROUTES` in `app/_layout.tsx`).
- Accurately details tab configuration (`V2TabBar`, `getMobileTabTitle`, `TabsLayout` in `app/(tabs)/_layout.tsx`) driven by `@cisa/core:tabsForRole`.
- Verified invariants match source code: Metro config (`metro.config.js`) explicitly blocks `packages/core/node_modules` for dual-instantiation protection, input height caps at `MULTILINE_FIELD_MAX_HEIGHT` (160px), and modal portals buffer inputs via `BufferedTextInput`.
- Test harness specifications match package scripts (`jest`, `tsc --noEmit`, `maestro test .maestro/`).

## packages/README.md
No drift detected.
- Accurately indexes packages, linking to `@cisa/core`.

## packages/core/README.md (Shared Core Library)
- Resolved Divergence: Previously referenced `partners.ts` as holding pure in-memory cache updates. In reality, `partners.ts` is located in `packages/core/src/data/partners.ts` providing Firestore persistence, while in-memory live roster state is held in `packages/core/src/walking.ts` (`FULL_TIMER_UIDS` and `TRAINEE_UIDS`). Updated contract to accurately reflect `walking.ts` in-memory state and `src/data/*` persistent storage adapters.
- Parity: Correctly specifies platform-agnostic pure logic consumed symmetrically by both the website version and native mobile version.

## src/README.md (Website Version Source Root)
No drift detected.
- Clarified documentation to explicitly designate `src/` as the **website version** (desktop and mobile browser Single Page Application) to avoid confusion with native mobile code in `apps/mobile`.
- Interface exports verified: `useLayout`, `useOptionalLayout`, `App` in `App.tsx`, constants in `src/constants.ts`, and core domain types in `src/types.ts`.
- Correctly links and routes into all 7 primary web subtrees (`components`, `hooks`, `lib`, `scripts`, `server`, `services`, `views`).

## functions/README.md (Cloudflare Edge Functions)
No drift detected.
- Correctly documents `/api/*` reverse proxy and same-origin Firebase authentication bridging for the website version to prevent cross-origin cookie and third-party storage issues.

## firebase-functions/README.md (Firebase Cloud Functions)
No drift detected.
- Correctly documents background cloud functions supporting both mobile (Expo push notifications) and web (Web Push / FCM), weekly translations, and reminder sweeps.

## scripts/README.md (Repository Automation)
No drift detected.
- Correctly documents verification guards (`check-seams.ts`, `check-i18n.ts`, `check-secrets.ts`), test account pruning, and automated database seeding routines.
