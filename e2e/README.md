# E2E permissions tests

Playwright tests that sign in as **real Firebase email/password users** (one per
role) and verify the role-based access control: sidebar nav items, route
access/redirects, and the Quick Actions FAB.

No Firebase emulator and no Java are required — the tests hit the real
`sac-campus-hub` project.

## Roles

| Display name | Internal role |
| ------------ | ------------- |
| Full-timer   | `admin`       |
| Trainee      | `manager`     |
| Student      | `operator`    |
| Community    | `viewer`      |

The actual login emails/passwords live in `e2e/.test-credentials.json` (gitignored).

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

```bash
VITE_FIREBASE_API_KEY=<real-web-api-key> npm run test:e2e
```

`playwright.config.ts` starts the dev server with `VITE_E2E_MODE=true`, which
exposes `window.__e2eSignIn(email, password)` (defined in `src/lib/firebase.ts`).
That helper is **only** present in E2E mode and never ships in the production
bundle.

## How sign-in works

The app's normal sign-in is Google OAuth (a popup Playwright can't drive). In E2E
mode the test calls `window.__e2eSignIn(...)` to authenticate the real user via
email/password, then waits for the app shell to render before asserting.
