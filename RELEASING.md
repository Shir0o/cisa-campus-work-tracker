# Releasing the mobile app

This describes the pipeline that builds a signed AAB and IPA **on a GitHub
runner** and submits them to the Google Play **internal testing** track and to
**TestFlight**. Promotion to production stays a manual click in each console.

The shape mirrors `Shir0o/bible-read`; the mechanism does not, because this is an
Expo/EAS project rather than a Flutter one. The rationale is in
[`docs/adr/0020-mobile-release-automation.md`](docs/adr/0020-mobile-release-automation.md).

## How a release happens

1. A conventional-commit PR (e.g. `feat:`, `fix:`) lands on `main`. The title
   carries the signal — release-please reads **PR titles**, not commit messages.
2. `.github/workflows/release-please.yml` opens or updates a **release PR** that
   bumps `apps/mobile/package.json` and regenerates `apps/mobile/CHANGELOG.md`.
3. You review and merge that PR.
4. The merge pushes a tag (e.g. `v1.4.0`). Two workflows fire on it:
   - `release-android.yml` — derives the version, builds a signed **AAB** with
     `eas build --local`, submits it to the Play internal track as a **draft**
     (testers are not notified), and attaches the AAB plus compiled notes to the
     GitHub Release.
   - `release-ios.yml` — derives the version, builds a signed **IPA**, submits it
     to **TestFlight** with the compiled notes as “What to Test”, and attaches
     both to the GitHub Release.
5. **You** open each console, verify, and promote.

Both release jobs sit behind the `mobile-release` environment, so they pause for
approval before doing anything.

## PR title conventions

| Prefix | Effect |
| --- | --- |
| `feat:` | Minor bump; lands under “Features” |
| `feat!:` | Major bump; lands under “Features” |
| `fix:` | Patch bump; lands under “Bug Fixes” |
| `perf:` | Patch bump; lands under “Performance” |
| `refactor:` | No bump; lands under “Refactoring” |
| `docs:`, `test:`, `build:`, `ci:`, `chore:`, `revert:` | Hidden from the changelog (still allowed) |

A `BREAKING CHANGE:` footer also triggers a major bump.

`.github/workflows/pr-title-lint.yml` enforces the prefix, so a title that
release-please would ignore fails the PR check instead of failing silently.
It also requires a lowercase subject - that is the one tunable: relax
`subjectPattern` in that workflow if it proves too strict.

## One-time setup

### A. Play Console (already wired)

The app exists and a service account is linked with the **Release Manager** role.
What the pipeline still needs is the **JSON key file** for that service account —
the console link is not itself the credential.

1. Google Cloud Console → IAM & Admin → Service Accounts → that account →
   **Keys** → **Add key** → JSON. Download it.
2. Play App Signing is enrolled, so CI signs with the **upload key** and Google
   re-signs for distribution.

### B. App Store Connect (not wired up yet)

1. Confirm the app record exists for `com.cisa.campus`, or let EAS create it
   (`eas submit` supports `--auto-testflight-setup`).
2. Record the **App Store Connect app ID** and the **Apple Team ID**.
3. Users and Access → **Integrations → App Store Connect API → Team Keys** →
   create a **Team Key** with the **App Manager** role.
   - Download the `.p8` — you cannot download it twice.
   - Record the **Key ID** and the **Issuer ID**.
4. Put all five values into `apps/mobile/eas.json` under `submit.production.ios`,
   replacing the `REPLACE_WITH_*` placeholders. All three `ascApiKey*` fields
   must be present together or `eas submit` throws.

> `~/.app-store/auth/*` and `itunes_service_key.txt` are iTunes Transporter /
> `altool` credentials. They are **not** an App Store Connect API key and cannot
> be used by `eas submit`.

### C. On your Mac — generate `credentials.json`

Do **not** hand-roll a `.p12` and `.mobileprovision`. Let EAS generate and record
them once.

```bash
cd apps/mobile
npx eas-cli build --profile production --platform ios     --local
npx eas-cli build --profile production --platform android --local
```

EAS prompts for your Apple login, sets up the distribution certificate,
provisioning profile, and Android upload keystore, and writes
`apps/mobile/credentials.json`. That file is already covered by `.gitignore`.

### D. GitHub secrets

| Secret | What it is |
| --- | --- |
| `RELEASE_PLEASE_TOKEN` | PAT with `contents:write` and `pull-requests:write`. **Mandatory** — tags created with the built-in `GITHUB_TOKEN` are suppressed by GitHub's recursion prevention and will never trigger the release workflows. |
| `EXPO_TOKEN` | Expo access token. `eas build --local` still authenticates to EAS. |
| `EAS_CREDENTIALS_JSON_B64` | `base64 -i apps/mobile/credentials.json` — the Android keystore **and** the iOS certificate and profile in one file. |
| `PLAY_SERVICE_ACCOUNT_JSON_B64` | `base64 -i <service-account>.json` |
| `ASC_API_KEY_P8_B64` | `base64 -i AuthKey_XXXX.p8` |
| `ASC_KEY_ID` | App Store Connect API Key ID |
| `ASC_ISSUER_ID` | App Store Connect Issuer ID |

Base64 output must have no line wrapping and no trailing newline:

```bash
base64 -i apps/mobile/credentials.json | tr -d '\n'
```

`google-services.json` and `GoogleService-Info.plist` are **committed** and need
no secret.

### E. The `mobile-release` environment

Settings → Environments → `mobile-release` → add **required reviewers**. On a
public repository this gate is the only thing between a merged PR and both
stores.

## Running a release

Nothing to run. Merge the release PR.

To re-run a failed release, re-run the failed job from the Actions tab. Apple
will reject a reused `CFBundleVersion`, so if the IPA already reached App Store
Connect you must cut a new tag rather than re-submit the same build number.

## Building locally

Both `eas build` (cloud) and `eas build --local` on your machine obey the same
`appVersionSource: "local"` setting as CI. Because `eas build` has no
`--build-number` flag, **run the version script first** or you will build
whatever number is stale in `app.json`:

```bash
npx tsx scripts/mobile-version.ts --tag v1.4.0    # writes app.json
cd apps/mobile && npx eas-cli build --profile production --platform android
```

Add `--dry-run` to inspect without writing. `autoIncrement` is deliberately
off everywhere: with a local version source it edits `app.json` on disk, which
would fight the tag and make two machines able to mint the same build number.

## Store release notes

Notes are compiled from `content/whats-new/`, the single authored source per
ADR 0008:

```bash
npx tsx scripts/store-release-notes.ts --platform play --version 1.4.0
npx tsx scripts/store-release-notes.ts --platform testflight --version 1.4.0
```

Play is capped at 500 characters; the script enforces that. **`eas submit`
cannot upload Play release notes** — there is no option for it. They are
attached to the GitHub Release and you paste them into the Play Console while
promoting. TestFlight is automatic via `--what-to-test`.

## Known conflict

The newest tag is `v1.3.8`, but `apps/mobile/app.json` said `1.0.1` and
`content/whats-new` says `1.4.0`. The manifest baseline is `1.3.8`. Reconcile the
whats-new version and confirm what the stores actually hold **before the first
automated release** — App Store Connect rejects a `CFBundleShortVersionString` at
or below the last approved build.

## Not done yet

- **No OTA updates.** No profile sets a `channel`, so `expo-updates` cannot
  publish. Enabling it needs a channel per profile and a `runtimeVersion`
  decision.
- **Two overlapping “what's new” systems.** `content/whats-new/*.md` (ADR 0008)
  and `packages/core/src/releases.ts` (#546) both tell users what changed. Store
  notes are compiled from the former. They have not been reconciled.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Release workflow never runs after merging the release PR | `RELEASE_PLEASE_TOKEN` is unset, so the tag was created by `GITHUB_TOKEN` and suppressed. |
| `Missing required GitHub secrets: …` | One of the secrets above is empty. |
| `eas submit` fails complaining about `ascApiKey*` | `ascApiKeyPath`, `ascApiKeyId`, and `ascApiKeyIssuerId` must all be set. |
| Play rejects the AAB as a duplicate version code | A local build ran without `scripts/mobile-version.ts`, shipping a stale number. |
| `AutoIncrement option is not supported when using app.config.js` | The static `app.json` was replaced with a dynamic config. |
