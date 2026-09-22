# 0031. Every bell entry is pushed by a Firestore trigger

Date: 2026-09-22

## Status

Accepted

## Context

OS push was opt-in per call site: a writer put a doc in `notifications` (the bell) and, separately, might call `/api/send-push`. Only thread and chat writers did, so to-dos, asks, new contacts, public sign-ups and every server-written notification reached the bell but never a device. The web had no Web Push at all — an OS alert appeared only while a tab was open — so an installed PWA (iOS, Android, desktop) never buzzed. A user had one `pushToken`, so a second phone took over the first. `/api/send-push` was unauthenticated: anyone could push any text to any user's phone.

## Decision

- **The bell doc is the trigger.** A Firebase Function (`firebase-functions/`, `onDocumentCreated('notifications/{id}')` on `prod` and `qa-db`) pushes every new bell entry. Nothing else sends push; `/api/send-push` and the client push helpers are gone.
- **Devices, not a token.** Each signed-in device registers `users/{uid}/pushDevices/{deviceId}` — an Expo token (native) or a Web Push subscription (browser / installed PWA, VAPID). Only the owner may write or delete it; sign-out removes this device's doc. Devices the push service reports gone are deleted. The legacy `users.pushToken` is still read for old native builds.
- **Audience.** `ALL_ADMINS` broadcasts (e.g. a public sign-up) go to Full-timers (`role == 'admin'`) only — in the bell and in push.
- **Noise.** A bell entry may carry `coalesceKey`; the function pushes at most once per key per recipient per hour (#813). Stakeholder thread notifications use `contact:<id>`. An @mention carries no key — it always buzzes — and no longer silences the other stakeholders' pushes.

## Consequences

- A new notification writer gets push for free; it only has to write the bell doc.
- The e2e suite runs the Functions emulator, where pushes are recorded in `pushSink` instead of sent (`e2e/push-notifications.spec.ts`).
- Deploys need the `EXPO_ACCESS_TOKEN` and `VAPID_PRIVATE_KEY` secrets in Secret Manager; the VAPID public key is committed in `firebase-functions/src/index.ts` and `src/lib/webPush.ts` and must change together.
- iOS delivers Web Push only to a Home Screen app (iOS 16.4+); Safari in a tab cannot subscribe.
