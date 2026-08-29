# E2E tests

Playwright tests for the web app. Every spec signs in as **real Firebase
email/password users** (one per role) and drives the actual UI against the
Firebase Local Emulator Suite — Auth + Firestore, **zero cloud secrets**.

## What's covered

| Spec | Area |
| --- | --- |
| `permissions.spec.ts` | Role matrix: landing route, sidebar nav, route guards |
| `settings-and-partners.spec.ts` | Admin settings, gospel partner assignments, role gating (#629) |
| `walking-together-threads.spec.ts` | Contact threads, team confidentiality (#630) |
| `cross-role-journey.spec.ts` | Quick Capture → Journey pipeline across roles (#631) |
| `quick-capture.spec.ts` | Quick capture flow on My Day |
| `asks-questions-for-team.spec.ts` | Questions-for-the-team page, staff-only (#603, #645) |
| `outreach-signup.spec.ts` | Outreach view + public sign-up intake form |
| `the-journey-board.spec.ts` | Journey board + coordination notes |
| `people-directory.spec.ts` | Directory access per role |
| `prayer-carrying.spec.ts` | Prayer wall per role |
| `gatherings-attendance.spec.ts` | Gatherings + attendance |
| `feedback-submission.spec.ts` | In-app feedback |
| `impersonation-personas.spec.ts` | Persona impersonation |

## Running

### Recommended: Firebase Emulator (zero secrets, safe data mutation)

```bash
npm run test:e2e:emulator
```

This single command:

1. Starts the local Auth (`:9099`) and Firestore (`:8080`, database `qa-db`)
   emulators for project `sac-campus-hub`.
2. Seeds the emulator (`scripts/seed-emulator.ts`): the five test users
   (Full-timer, 2× Trainee, Student, Community) with approved `/users` docs,
   plus sample data (gathering, journey stages, the `Lila Chen` contact with
   seeded threads). Seeding is idempotent — safe to re-run.
3. Runs the whole Playwright suite (`npx playwright test`) and tears the
   emulators down afterwards.

Prerequisites:

- Node 20+
- **JDK 21+** — recent `firebase-tools` refuses to boot the emulators on older
  JVMs (this is also what CI installs). Check with `java -version`.
- No `.test-credentials.json` and no API key needed: in emulator mode
  (`VITE_USE_FIREBASE_EMULATOR=true`, set by `playwright.config.ts`) the
  credentials come from `e2e/helpers/auth-defaults.ts`.

### Against real cloud Firebase (legacy)

```bash
cp e2e/.test-credentials.example.json e2e/.test-credentials.json
# edit e2e/.test-credentials.json — gitignored; users must exist in the real
# project with approved /users docs (see "One-time setup" in git history)
VITE_FIREBASE_API_KEY=<real-web-api-key> VITE_USE_FIREBASE_EMULATOR=false npm run test:e2e
```

Hits the real `sac-campus-hub` project and mutates real data — prefer the
emulator.

## Determinism

- `playwright.config.ts` runs a **single worker, serially, zero retries** —
  specs share one seeded emulator database, so order matters and races are
  designed out rather than retried away.
- Specs that build on a previous test's data use
  `test.describe.configure({ mode: 'serial' })`.
- Unique-per-run names (e.g. `` `Journey Tester ${Date.now()}` ``) avoid
  collisions with data left by earlier runs.
- The emulator database starts empty on every `emulators:exec` invocation, so
  the seed + suite pair is fully reproducible.

## Roles & expectations

| Display name | Internal role | Sidebar nav (in addition to lower roles)                |
| ------------ | ------------- | ------------------------------------------------------- |
| Community    | `viewer`      | Home, Gatherings, Prayer, Messages, Settings            |
| Student      | `operator`    | + People                                                |
| Trainee      | `manager`     | + The Journey, Looking back                             |
| Full-timer   | `admin`       | + Coordination Notes (and the home item reads "My Day") |

Every approved role lands on `/`; a guarded route (`/board`, `/directory`,
`/history`, `/coordination`, `/admin/feedback`) redirects a denied role back to
`/`. The matrix mirrors `src/lib/permissions.ts` (and its unit test,
`src/test/permissions.test.tsx`).

## How sign-in works

The app's normal sign-in is Google OAuth (a popup Playwright can't drive). In
E2E mode (`VITE_E2E_MODE=true`, set by `playwright.config.ts` for the dev
server it starts on `:3000`) the tests call `window.__e2eSignIn(email,
password)` — exposed by `src/lib/firebase.ts` **only** in E2E mode and never
shipped in the production bundle. In emulator mode the helper authenticates
against the local Auth emulator.

## CI

`.github/workflows/e2e.yml` runs the emulator suite nightly (cron) and on
manual dispatch, with zero repository secrets: it installs JDK 21, runs
`npm run test:e2e:emulator`, and uploads the Playwright report on failure.
