# apps/mobile — Expo (React Native) app

The native iOS/Android app (and, later, web) for CISA Campus. Shares business
logic with the web app via [`@cisa/core`](../../packages/core).

## First-time setup

```bash
cd apps/mobile
npm install
# Reconcile any version drift against the installed Expo SDK:
npx expo install --fix
cp .env.example .env   # then set EXPO_PUBLIC_FIREBASE_API_KEY
```

## Run

```bash
npm run web      # fastest to eyeball in a browser (react-native-web)
npm run ios      # iOS simulator (needs Xcode)
npm run android  # Android emulator (needs Android Studio)
# or: npx expo start --dev-client  → press i / a, or scan the QR with a development build

Native development uses **development builds**, not Expo Go (Expo Go cannot run
this app and ignores most `app.json` fields, so behavior diverges from
production). First install a development build on the simulator/device:

```bash
npx eas build --platform ios --profile development    # or --platform android
```

then `npm start` and press `i`/`a` (or scan the QR with the installed
development build) to launch it.
```

## Production web build

```bash
npm run build:web   # expo export -p web → static output in dist/
```

`web.output` is `"single"` (one HTML file, all routing client-side) — serving
`dist/` from any static host needs a catch-all rewrite to `index.html` for
deep links / hard reloads on nested paths (e.g. Cloudflare Pages' `_redirects`
with `/* /index.html 200`); without one, a direct load of a nested path 404s.
No such host is wired up yet — see [`MIGRATION.md`](../../MIGRATION.md)'s
Phase 6 section.

## How the shared package resolves

`@cisa/core` is NOT installed via npm workspaces (the web app is on React 19,
this app on Expo/React 18.3 — hoisting would clash). Instead:

- **Metro** resolves it via `extraNodeModules` + `watchFolders` in
  [`metro.config.js`](./metro.config.js) → `../../packages/core` (TS source).
- **TypeScript** resolves it via the `paths` alias in
  [`tsconfig.json`](./tsconfig.json).
- `date-fns` (core's only runtime dep) is declared here so Metro finds it.

## App-store delivery (EAS Build)

`eas-cli` is a local devDependency (`npx eas ...` resolves without a global
install) and [`eas.json`](./eas.json) has `development`/`preview`/`production`
build profiles. The project isn't linked to an Expo account yet — that step
needs your own Expo/Apple/Google credentials, which can't be done for you:

```bash
npx eas login          # your Expo account
npx eas init            # links/creates the EAS project, writes extra.eas.projectId to app.json
npx eas build --platform ios --profile preview      # or --platform android
```

An Apple Developer / Google Play account (and, for iOS, `eas build`'s
interactive credential setup or an existing distribution certificate) is
needed before a build can go to TestFlight or a Play internal track.

## QA (staging) environment

A reviewer can exercise the app against an isolated **`qa-db`** Firestore
database in the same `sac-campus-hub` project — same frontend code, no risk to
prod data. Firestore data is fully separate; Firebase Auth users, Cloud Storage
bucket, and Realtime Database are shared with prod.

- **Database:** `qa-db` (created with `gcloud firestore databases create`).
  Rules + indexes are deployed alongside prod via `firebase deploy
  --only firestore:rules,firestore:indexes` (also on merge to main).
- **Backend:** QA Cloud Run service `campus-hub-qa` with
  `FIREBASE_FIRESTORE_DB_ID=qa-db`, so push/quick-add/AI run against QA data.
  Fronted by a Cloudflare Pages QA site
  (`https://cisa-campus-work-traker-qa.pages.dev`) whose `/api/*` proxy targets
  the QA backend — see `CLOUDFLARE_DEPLOYMENT.md` for the QA project setup.
- **Seed data:** `npm run seed:qa` (from the repo root) writes approved
  `/users` docs for the four E2E accounts (looked up — or created — in shared
  Auth) plus a full fake dataset to explore: the stages/gathering-types
  taxonomies, ~8 contacts (with interactions, comments, and walking-together
  threads), prayers + prayer requests, gathering events + RSVPs, chat rooms +
  messages, to-dos, notifications, coordination-notes pages, an outreach
  record, and activity entries.

### Reviewer credentials

| Role      | Email                          | Password      |
|-----------|--------------------------------|---------------|
| Reviewer (admin)  | `reviewer.e2e@example.com`  | `password123` |
| Full-timer (admin) | `fulltimer.e2e@example.com` | `password123` |
| Trainee (manager)  | `trainee.e2e@example.com`  | `password123` |
| Student (operator) | `student.e2e@example.com`  | `password123` |
| Community (viewer) | `community.e2e@example.com`| `password123` |

Reviewers sign in with the pre-created `reviewer.e2e@example.com` account
(admin). They can also sign in with their own Google account: `npm run seed:qa`
approves `QA_REVIEWER_EMAILS` (comma-separated, default `yilongwang05@gmail.com`)
as admin — add your email there (or just sign in once, then re-run the seed) so
your account gets an approved admin doc in `qa-db`.

### Build & distribute the QA app

```bash
npx eas build --platform ios --profile qa      # and/or --platform android
```

The `qa` profile bakes in `EXPO_PUBLIC_FIREBASE_FIRESTORE_DB_ID=qa-db` and
`EXPO_PUBLIC_API_URL` → the Cloudflare QA URL, then publishes an internal
distribution link the reviewer installs directly (no local toolchain).

### Local dev against QA

```bash
EXPO_PUBLIC_FIREBASE_FIRESTORE_DB_ID=qa-db \
EXPO_PUBLIC_API_URL=https://cisa-campus-work-traker-qa.pages.dev \
npm start
```

(Or set those two vars in `.env`.)

### Web app against QA

The web SPA can also target QA by building with the `qa-db` override; only the
Cloudflare proxy handles `/api/*`, so the client bundle must be pointed at QA too:

```bash
VITE_FIREBASE_FIRESTORE_DB_ID=qa-db npm run build
```

For the deployed QA site, set both `BACKEND_API_URL` (runtime `/api/*` proxy)
and `VITE_FIREBASE_FIRESTORE_DB_ID=qa-db` (build-time Firestore target) on the
Cloudflare Pages QA project — see `CLOUDFLARE_DEPLOYMENT.md`.

### Limitations

- **The Board collab editor** is a WebView served by the *web* SPA, so QA builds
  don't exercise it; with `EXPO_PUBLIC_FIREBASE_DATABASE_URL` unset the Board
  falls back to Firestore-only editing.
- **Photos** land in the shared prod Storage bucket (rules-capped, low risk).
- **Realtime Database** is shared — leave `EXPO_PUBLIC_FIREBASE_DATABASE_URL`
  unset in QA to avoid writing to prod's live board.

## Production DB rename cutover (`ai-studio-…` → `prod`)

The production Firestore database id can't be renamed in place, so it was
migrated to a new named database `prod` (data already copied, rules/indexes and
the daily backup schedule recreated on `prod`). The old `ai-studio-…` database is
left running until the switch is coordinated, because the database id is baked
into already-built clients (web bundle + installed mobile apps).

**Order matters — do the whole sequence in one window to avoid split-brain:**

1. **Write-freeze** — stop user writes (or accept a small delta).
2. **Final sync** — catch any writes made since the initial copy:
   ```bash
   SOURCE_DATABASE_ID=ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897 \
   DEST_DATABASE_ID=prod npx tsx scripts/migrate-db.ts
   ```
3. **Cut over the backend** — set the prod Cloud Run service's DB id:
   ```bash
   gcloud run services update campus-hub-backend --region us-west2 \
     --update-env-vars=FIREBASE_FIRESTORE_DB_ID=prod
   ```
4. **Redeploy the web app** (rebuilds `firebase-applet-config.json` = `prod`).
5. **Release the mobile app** — `npx eas build --platform ios --profile production`
   (and Android) so the new build points at `prod`.
6. **Verify** writes land in `prod`, then delete the old database:
   ```bash
   gcloud firestore databases delete --database=ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897 --project=sac-campus-hub
   ```

## What's in place (Phase 0)

- Theme from the web app's Material tokens (`src/theme/`), light + dark, warm
  "Field notes" palette.
- Primitive library (`src/components/ui/`): Screen, AppText, Button, Card, Chip,
  Avatar, SectionHead, StatusPill.
- Firebase JS SDK wired for RN (`src/lib/firebase.ts`): AsyncStorage auth
  persistence, the named Firestore db id, opt-in RTDB.
- Expo Router nav shell: bottom tabs (Home / People / Prayer / More) with labels
  from the shared `NAV_ITEMS`.

## Not yet done (next)

- **Password reset** — `app/login.tsx` has no forgot-password entry point yet,
  even though `src/lib/firebase.ts` already has Firebase Auth wired for it.
- **App-store delivery**'s account-linking step (`eas login`/`eas init`),
  retiring the old web app (blocked on the user picking a real deploy
  target), and reconciling React versions (deferred, higher-risk Expo SDK
  bump) — see [`MIGRATION.md`](../../MIGRATION.md) for the full status;
  everything else it once listed here (fonts, the collab editor WebView
  spike, live Firestore data, the production web export) has since shipped.
