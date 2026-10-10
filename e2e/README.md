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
| `quick-capture.spec.ts` | NewContactModal: minimum payload, full disclosure, role gating, persistence (#628) |
| `the-journey-board.spec.ts` | Journey board columns, stage advance via the contact editor, role gating, Coordination Notes (#628) |
| `feedback-submission.spec.ts` | Feedback form, kind selector, Send gating, admin triage access, role redirects, FAB presence (#628) |
| `impersonation-personas.spec.ts` | Owner-only "See as their view" modal, four role-preview chips, nav-scoping on simulate, back-to-my-view reset (#628) |
| `asks-questions-for-team.spec.ts` | Questions-for-the-team page, staff-only (#603, #645) |
| `notification-bell-deep-linking.spec.ts` | Notification bell deep-linking, contact modal routing, and chat room URL synchronization (#682) |
| `outreach-signup.spec.ts` | Outreach view + public sign-up intake form |
| `people-directory.spec.ts` | Directory access per role |
| `prayer-carrying.spec.ts` | Prayer wall per role |
| `gatherings-attendance.spec.ts` | Gatherings + attendance |
| `announcements-flow.spec.ts` | Announcements UI/UX rework, broadcast wizard, thread replies, read receipts (#743) |

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

Extra arguments after `--` reach `playwright test`, so you can run a single
spec (or a shard) against a fresh seeded emulator:

```bash
npm run test:e2e:emulator -- e2e/permissions.spec.ts
npm run test:e2e:emulator -- --shard=1/2
```

The emulator boots from `firebase.e2e.json`, a single-database view of
`firebase.json` that points it at `firestore.rules`. `firebase.json` itself
lists two named databases (`prod`, `qa-db`) for deploys, which the emulator
cannot load rules from — it would silently fall back to allowing every read and
write (the slip that let permission bugs through from #294 until #1459). The
runner (`scripts/run-e2e-emulator.sh`) fails the run if the emulator log
contains "default to allowing all reads and writes".

Prerequisites:

- Node 24 (what CI uses)
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

`.github/workflows/e2e.yml` runs the emulator suite in **2 Playwright shards**
(`--shard=1/2`, `--shard=2/2`), each with its own emulator, on:

- every `pull_request` that touches `src/`, `packages/core/`, `server.ts`,
  `firestore.rules`, `e2e/`, `scripts/seed-emulator.ts`, or `package*.json`;
- every `push` to `main`;
- manual dispatch.

It is an **advisory** check (not required to merge), installs JDK 21, and
uploads each shard's Playwright report on failure. There are zero repository
secrets.
