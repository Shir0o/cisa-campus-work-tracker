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
