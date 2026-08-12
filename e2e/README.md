# E2E permissions tests

Playwright tests that sign in as **real Firebase email/password users** (one per
role) and verify the role-based access control: the landing route, the sidebar
nav items, and route access/redirects.

No Firebase emulator and no Java are required — the tests hit the real
`sac-campus-hub` project. The matrix mirrors `src/lib/permissions.ts` (and its
unit test, `src/test/permissions.test.tsx`).

## Roles & expectations

| Display name | Internal role | Sidebar nav (in addition to lower roles)                |
| ------------ | ------------- | ------------------------------------------------------- |
| Community    | `viewer`      | Home, Gatherings, Prayer, Messages, Settings            |
| Student      | `operator`    | + People                                                |
| Trainee      | `manager`     | + The Journey, Looking back                             |
| Full-timer   | `admin`       | + Coordination Notes (and the home item reads "My Day") |

Every approved role lands on `/`; a guarded route (`/board`, `/directory`,
`/history`, `/coordination`, `/admin/feedback`) redirects a denied role back to
`/`. The actual login emails/passwords live in `e2e/.test-credentials.json`
(gitignored).

## One-time setup

1. Copy the credentials template and fill in the real passwords:
   ```bash
   cp e2e/.test-credentials.example.json e2e/.test-credentials.json
   # edit e2e/.test-credentials.json — this file is gitignored
   ```
2. Make sure the four users exist in Firebase Auth (email/password) **and** have an
   approved `/users/{uid}` doc with the matching `role`. The app signs out any
   authenticated user without an approved doc, so this step is required. Two ways:

   - **In-app (no service account):** sign in to the app as an admin →
     Settings → Add Member → invite each of the four emails with the right role
     (Full-timer / Trainee / Student / Community). The approved `/users` doc is
     created automatically on each user's first sign-in.
   - **Seed script (service account):**
     ```bash
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json npm run seed:e2e-users
     ```
     Looks up each UID by email and writes an approved user doc directly.

## Running

### Recommended: Firebase Emulator (Zero Secrets / Safe Data Mutation)

```bash
npm run test:e2e:emulator
```

Starts the local Firebase Auth & Firestore emulators, seeds default test users automatically, and runs Playwright against the local in-memory database.

### Against Real Cloud Firebase

```bash
VITE_FIREBASE_API_KEY=<real-web-api-key> npm run test:e2e
```

`playwright.config.ts` starts the dev server with `VITE_E2E_MODE=true`, which
exposes `window.__e2eSignIn(email, password)` (defined in `src/lib/firebase.ts`).
That helper is **only** present in E2E mode and never ships in the production
bundle.

## CI

`.github/workflows/e2e.yml` runs this suite, but because it hits the real
Firebase project it is **gated** — it runs only on manual dispatch ("Run
workflow") or on a pull request that carries the `e2e` label, and is
non-blocking (not in the required-checks ruleset). It requires two repo secrets:

- `VITE_FIREBASE_API_KEY` — the Firebase web API key
- `E2E_TEST_CREDENTIALS` — the full JSON contents of `e2e/.test-credentials.json`

## How sign-in works

The app's normal sign-in is Google OAuth (a popup Playwright can't drive). In E2E
mode the test calls `window.__e2eSignIn(...)` to authenticate the real user via
email/password, then waits for the app shell to render before asserting.
