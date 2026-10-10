#!/usr/bin/env bash
# Boot the Firebase Emulator (with firestore.rules enforced), seed it, run the
# Playwright suite, and fail if the emulator silently fell back to open rules.
#
# `firebase.json` lists two named Firestore databases (`prod`, `qa-db`) for
# deploys, which the emulator cannot read rules from — it warns and allows every
# read/write (#294). `firebase.e2e.json` is the emulator view with a single
# default database pointed at firestore.rules.
set -euo pipefail

LOG="${E2E_EMULATOR_LOG:-emulator.log}"

# Any extra args (e.g. a single spec path, or `--shard=1/2`) are forwarded to
# `playwright test`: `npm run test:e2e:emulator -- e2e/permissions.spec.ts`
# and `npm run test:e2e:emulator -- --shard=1/2` both reach Playwright.
npx firebase-tools emulators:exec \
  --project sac-campus-hub \
  --config firebase.e2e.json \
  --only auth,firestore,functions \
  "npx tsx scripts/seed-emulator.ts && npx playwright test $*" 2>&1 | tee "$LOG"

if grep -q "default to allowing all reads and writes" "$LOG"; then
  echo "::error::The emulator did not load firestore.rules and defaulted to open reads/writes."
  exit 1
fi
