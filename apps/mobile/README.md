# CISA Campus Mobile App (`apps/mobile`)

Expo / React Native mobile application for CISA Campus Work Tracker.

[← Back to Root README](../../README.md) • [Mobile Setup Guide](SETUP.md) • [Build & Submit Reference](BUILD_AND_SUBMIT.md)

---

## E2E Testing with Maestro

We use [Maestro](https://maestro.mobile.dev/) for cross-platform mobile UI end-to-end (E2E) testing on iOS Simulators and Android Emulators.

### 1. Prerequisites

- **Maestro CLI**:
  ```bash
  # macOS / Linux
  curl -fsSL "https://get.maestro.mobile.dev" | bash
  # Or via Homebrew
  brew install mobile-dev-inc/tap/maestro
  ```
- **Simulator / Emulator**:
  - **iOS**: Xcode installed with iOS Simulator (`npx expo run:ios`).
  - **Android**: Android Studio with an active Android Virtual Device (AVD) (`npx expo run:android`).

### 2. Running E2E Tests Locally

1. Start your Expo build on simulator/emulator:
   ```bash
   npm run android  # or npm run ios
   ```
2. Run Maestro test suite:
   ```bash
   npm run test:e2e
   ```
   Or run a single test flow:
   ```bash
   maestro test .maestro/01_app_launch.yaml
   ```

### 3. Continuous Integration (GitHub Actions)

Mobile E2E tests run automatically in GitHub Actions on a **daily schedule at midnight (00:00 UTC)** as well as on-demand via manual trigger (`workflow_dispatch`).
Workflows are defined in [`.github/workflows/mobile-e2e.yml`](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/setup_mobile_e2e_testing/.github/workflows/mobile-e2e.yml).

### 4. Keeping the flows honest

The flows assert strings the app really renders, so a shell change has to reach
`.maestro/` in the same PR. Two spots go stale quietly:

- **Nav rows.** `03_fulltimer_review.yaml` and `04_trainee_queue.yaml` name the
  rows of `FT_MORE` and `TRAINEE_DRAWER` (`packages/core/src/shell.ts`) one by
  one — and assert that a row that left is gone. A row that is added or removed
  there has to be added or removed in the flows too.
- **People's Step pills.** The flows stop at People's search box and do not
  assert the pills: they wait on the roster, so `PeopleScreen.test.tsx` pins
  them (labels, counts, order, and who gets none) instead.

This suite only runs nightly and on dispatch, so a PR that removes a row stays
green until the next run. Update the flow in the PR that changes the row.
