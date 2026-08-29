# Build & Submit Reference (QA / Production)

How to build and submit the iOS/Android app for the QA and production
environments, remotely (EAS cloud) or locally. All commands run from
`apps/mobile`:

```bash
cd apps/mobile
```

Everything below is also available as npm scripts (`npm run <name>`) — each
section shows both. `eas-cli` is a local devDependency, so no global install
is needed.

Build profiles live in [`eas.json`](./eas.json): `development`, `preview`,
`qa`, `testflight`, `production`.

| npm script                    | EAS command                                        |
|-------------------------------|----------------------------------------------------|
| `build:qa:ios`                | `eas build --platform ios --profile qa --auto-submit` |
| `build:qa:android`            | `eas build --platform android --profile qa`        |
| `submit:qa:android`           | `eas submit --platform android --profile qa`       |
| `build:prod:ios`              | `eas build --platform ios --profile production --auto-submit` |
| `build:prod:android`          | `eas build --platform android --profile production` |
| `submit:prod:android`         | `eas submit --platform android --profile production` |
| `build:preview:ios:local`     | `eas build --local --platform ios --profile preview` |
| `build:preview:android:local` | `eas build --local --platform android --profile preview` (outputs standalone `.apk`) |
| `build:qa:ios:local`          | `eas build --local --platform ios --profile qa`    |
| `build:qa:android:local`      | `eas build --local --platform android --profile qa` (outputs `.aab`) |
| `build:prod:ios:local`        | `eas build --local --platform ios --profile production` |
| `build:prod:android:local`    | `eas build --local --platform android --profile production` |
| `run:qa:ios`                  | `expo run:ios` with QA env vars (live logs)        |
| `run:qa:android`              | `expo run:android` with QA env vars (live logs)    |
| `run:prod:ios`                | `expo run:ios` with prod env vars (live logs)      |
| `run:prod:android`            | `expo run:android` with prod env vars (live logs)  |

## Prerequisites

```bash
npx eas login                     # your Expo account
npx eas init                      # links the EAS project (already done: app.json has extra.eas.projectId)
```

- **iOS signing:** Apple Developer account + distribution certificate (EAS
  walks you through this on first iOS build).
- **Android signing:** a Play Console service account JSON
  (`GOOGLE_SERVICE_ACCOUNT_JSON` credential in EAS) for submitting to the Play
  Store; building alone needs only the EAS-managed keystore.
- **Firebase:** `GoogleService-Info.plist` (iOS) and `google-services.json`
  (Android) are tracked in git and archived by EAS — they must match the
  Firebase project whose `qa-db`/`prod` database the build targets.

## Environment mapping

| Profile   | `EXPO_PUBLIC_API_URL`                        | Firestore DB |
|-----------|----------------------------------------------|--------------|
| `qa`      | `https://cisa-campus-work-tracker-qa.pages.dev` | `qa-db`    |
| `production` | `https://cisa-campus-work-tracker.pages.dev` | `prod`     |

> **Note:** `eas.json`'s `submit` block now includes a `qa` profile (empty —
> fine with a single App Store app), so `--auto-submit` / `eas submit
> --profile qa` works out of the box.

## Local runs (live logs)

`npm run android` / `npm run ios` are plain dev runs (`expo run:android` /
`expo run:ios`): they compile a debug build, install it on the simulator/
emulator, and attach Metro for live logs/reload. They are **not** pinned to an
environment — they pick up whatever `apps/mobile/.env` says (currently QA).
For an explicitly-pinned run against a given environment, use the `run:*`
scripts, which override the env vars on the command line:

```bash
npm run run:qa:android      # QA backend + qa-db, live logs
npm run run:qa:ios
npm run run:prod:android    # prod backend + prod db, live logs
npm run run:prod:ios
```

## QA environment

### Build iOS with auto-submit (TestFlight)

```bash
npm run build:qa:ios
# npx eas build --platform ios --profile qa --auto-submit
```

Builds in the cloud, then automatically submits to TestFlight. To build first
and submit later:

```bash
npx eas build --platform ios --profile qa            # note the build ID from the output
npx eas submit --platform ios --profile qa           # picks the latest build by default
```

### Build Android

```bash
npm run build:qa:android
# npx eas build --platform android --profile qa
```

### Submit Android (Play internal track)

```bash
npm run submit:qa:android
# npx eas submit --platform android --profile qa
```

Requires the Play service-account JSON in EAS credentials. Android builds do
not support `--auto-submit`; build and submit are separate steps.

## Production environment

### Build iOS with auto-submit (App Store Connect)

```bash
npm run build:prod:ios
# npx eas build --platform ios --profile production --auto-submit
```

The `production` profile uses `distribution: "store"` and
`autoIncrement: true` (build number bumps automatically, required by
App Store Connect). Submit later:

```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios --profile production
```

### Build Android

```bash
npm run build:prod:android
# npx eas build --platform android --profile production
```

### Submit Android (Play Store)

```bash
npm run submit:prod:android
# npx eas submit --platform android --profile production
```

## Local builds

Local builds compile on your machine instead of EAS's cloud. `--auto-submit`
is **not** supported for local builds; submit with `eas submit` afterwards.
These produce artifacts (`.ipa`/`.apk`/`.aab`) — if you want to develop
against an environment with live logs instead, use the `run:*` scripts above.

- **iOS:** macOS with Xcode required; signing uses the same EAS credentials
  (downloaded onto your machine).
- **Android:** JDK 17 + Android SDK required.

### Preview / Standalone APK (for instant device/emulator testing)

The `preview` profile builds an installable `.apk` directly (no Play Console or bundletool needed):

```bash
npm run build:preview:android:local
# npx eas build --local --platform android --profile preview
```

### QA, local

```bash
npm run build:qa:ios:local
npm run build:qa:android:local
# npx eas build --local --platform ios --profile qa
# npx eas build --local --platform android --profile qa
```

### Production, local

```bash
npm run build:prod:ios:local
npm run build:prod:android:local
# npx eas build --local --platform ios --profile production
# npx eas build --local --platform android --profile production
```

Local builds produce an installable artifact (`.ipa` / `.apk` / `.aab`) under
the project directory; `eas submit --profile <profile>` uploads it afterwards.
