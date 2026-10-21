#!/bin/sh
# The Android-emulator Maestro suite for Mobile E2E. Run by
# .github/workflows/mobile-e2e.yml; kept here because
# android-emulator-runner executes each line of its `script:` input as its own
# `sh -c`, which cannot carry an if-block.
#
# Credentials arrive as E2E_TEST_CREDENTIALS, the full JSON of
# e2e/.test-credentials.json (role key → { email, password }). They are never
# committed in the flows (#1713).
set -e

adb install android/app/build/outputs/apk/release/app-release.apk

if [ -z "$E2E_TEST_CREDENTIALS" ]; then
  echo "::error::E2E_TEST_CREDENTIALS secret is not set"
  exit 1
fi

# `jq -e` fails on a missing role or field, and `set -e` turns that into a stop
# before Maestro runs with an empty address.
cred() {
  printf '%s' "$E2E_TEST_CREDENTIALS" | jq -er --arg role "$1" --arg field "$2" '.[$role][$field]'
}
FT_EMAIL=$(cred fulltimer email)
FT_PASSWORD=$(cred fulltimer password)
TRAINEE_EMAIL=$(cred trainee email)
TRAINEE_PASSWORD=$(cred trainee password)
STUDENT_EMAIL=$(cred student email)
STUDENT_PASSWORD=$(cred student password)
COMMUNITY_EMAIL=$(cred community email)
COMMUNITY_PASSWORD=$(cred community password)

# On failure, print what the app actually showed and logged, so the cause is
# readable in the job log without the artifact.
if ! maestro test \
  -e FT_EMAIL="$FT_EMAIL" \
  -e FT_PASSWORD="$FT_PASSWORD" \
  -e TRAINEE_EMAIL="$TRAINEE_EMAIL" \
  -e TRAINEE_PASSWORD="$TRAINEE_PASSWORD" \
  -e STUDENT_EMAIL="$STUDENT_EMAIL" \
  -e STUDENT_PASSWORD="$STUDENT_PASSWORD" \
  -e COMMUNITY_EMAIL="$COMMUNITY_EMAIL" \
  -e COMMUNITY_PASSWORD="$COMMUNITY_PASSWORD" \
  .maestro/; then
  adb shell uiautomator dump /sdcard/ui.xml || true
  adb shell cat /sdcard/ui.xml || true
  echo
  adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E | tail -n 200 || true
  exit 1
fi
