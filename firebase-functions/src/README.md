# Firebase Functions Source (`firebase-functions/src`)

## Overview
Core Cloud Functions triggers, notification transport dispatchers, Expo receipt reconcilers, Gemini-driven translation sweep schedulers, and daily/weekly staff reminder crons.

## Interface
- `pushBellProd`: Firestore onDocumentCreated trigger on `prod` database for `notifications/{notificationId}` (`index.ts`)
- `pushBellQa`: Firestore onDocumentCreated trigger on `qa-db` database for `notifications/{notificationId}` (`index.ts`)
- `pushBellEmulator`: Firestore onDocumentCreated trigger on `(default)` database when `FUNCTIONS_EMULATOR=true` (`index.ts`)
- `scheduledReceiptsProd` / `scheduledReceiptsQa`: Scheduled cron `*/15 * * * *` executing `processExpoReceipts` (`index.ts`)
- `scheduledTranslateProd` / `scheduledTranslateQa`: Scheduled cron `0 4 * * *` executing `advanceTranslationCron` (max 200 items) (`index.ts`)
- `scheduledRemindersProd` / `scheduledRemindersQa`: Scheduled cron `0 8 * * *` executing `runAskReminders` (`index.ts`)
- `scheduledWeeklyRemindersProd` / `scheduledWeeklyRemindersQa`: Scheduled cron `0 * * * *` executing `runWeeklyReminders` (`index.ts`)
- `dispatchNotification(n: BellNotification, deps: DispatchDeps)`: Notification fan-out and dispatch (`dispatch.ts`)
- `capPushPayload(p: PushPayload)`: Unicode-safe push payload byte capping (`dispatch.ts`)
- `expoSender(fetchImpl, accessToken)`: Expo Push API transport sender (`transports.ts`)
- `expoReceiptFetcher(fetchImpl, accessToken)`: Expo delivery receipt batch retrieval (`transports.ts`)
- `webPushSender(client)`: Standard Web Push protocol sender (`transports.ts`)
- `processExpoReceipts(deps, now)`: Periodic Expo ticket and delivery receipt reconciler (`receipts.ts`)
- `advanceTranslationCron(deps, options)`: Periodic translation sweep runner (`translate.ts`)
- `translationHash(text, targetLang)`: Deterministic SHA-256 translation hash generator (`translate.ts`)
- `firestoreTranslationDeps(db, translateTextsFn, serverTimestampFn)`: Firestore storage dependencies for translation (`translateFirestore.ts`)
- `geminiTranslator(fetchImpl, apiKey, options)`: Gemini API translation client with exponential backoff (`translateFirestore.ts`)
- `runAskReminders(deps)` / `firestoreReminderDeps(db)`: Follow-up ask and unanswered question reminders (`reminders.ts`)
- `runWeeklyReminders(deps)` / `firestoreWeeklyDeps(db)`: Weekly staff reminders on campus schedule (`reminders.ts`)

## Invariants
- `MAX_PUSH_PAYLOAD_BYTES`: Serialized push payload is strictly capped at 3200 UTF-8 bytes to fit Web Push and Expo envelope constraints (`dispatch.ts`).
- `truncateWithEllipsis`: Truncation iterates strictly over Unicode code points so multi-byte characters and surrogate pairs are never split (`dispatch.ts`).
- `COALESCE_WINDOW_MS`: Coalescing throttles notifications to at most one push per coalesceKey per recipient per hour (3,600,000 ms) (`dispatch.ts`).
- Notification fan-out: Notifications addressed to `BROADCAST_TO_FULL_TIMERS` (`ALL_ADMINS`) fan out exclusively to users with role `admin` (`dispatch.ts`).
- `RECEIPT_READY_MS`: Expo delivery receipts are fetched only for tickets at least 15 minutes old (900,000 ms) (`receipts.ts`).
- `RECEIPT_TTL_MS`: Expo tickets older than 24 hours without receipt resolution are expired and purged (86,400,000 ms) (`receipts.ts`).
- Expo channel: Android pushes target the `default` notification channel with `high` priority; `DeviceNotRegistered` resolves as `gone` (`transports.ts`).
- Web Push TTL: Web push sets TTL to 86,400 and urgency to `high`; HTTP 404 and 410 responses resolve as `gone` to trigger device removal (`transports.ts`).
- Daily quota: Daily translation quota is transactionally throttled at 2000 items per UTC calendar date via `system/translationUsage` (`translateFirestore.ts`).
- Gemini batching: Translations batch up to 15 items per chunk and retry HTTP 429/500/502/503/504 up to 3 attempts with exponential backoff (`translateFirestore.ts`).
- Reminder schedule: Evaluates `settings/reminder_schedule` first on hourly tick and aborts early if the current campus weekday and hour do not match fullTimers or team plans (`reminders.ts`).
- Public VAPID key: `VAPID_PUBLIC_KEY` must remain synchronized with `WEB_PUSH_PUBLIC_KEY` in web client (`src/lib/webPush.ts`) (`index.ts`).
- Emulator isolation: Push events under emulator write to Firestore `pushSink` collection rather than contacting remote endpoints (`index.ts`).

## Side Effects
- Reads `users/{uid}/pushDevices` and `users/{uid}`; writes `pushTickets`; updates `pushThrottle/{uid}` via transactions; removes expired/invalid devices from `users/{uid}/pushDevices` (`index.ts`).
- Writes to `pushSink` collection in Firestore under local emulator (`index.ts`).
- Outbound HTTPS POST requests to `https://exp.host/--/api/v2/push/send` and `https://exp.host/--/api/v2/push/getReceipts` (`transports.ts`).
- Outbound HTTPS push requests to browser push service endpoints (`transports.ts`).
- Deletes handled or expired ticket documents from `pushTickets` collection (`receipts.ts`).
- Reads/writes cursor at `system/translationCursor`; tracks daily quota at `system/translationUsage`; batch writes translations to `translations` collection (`translateFirestore.ts`).
- Outbound HTTPS POST requests to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` (`translateFirestore.ts`).
- Adds reminder notifications to `notifications` collection; updates `contacts/{contactId}/threads/{messageId}` with `remindedAt` timestamp (`reminders.ts`).
- Reads users, contacts, interactions, events, threads, teamThreads, inboxState, userPreferences; writes to `notifications`; updates `users/{uid}` with `weeklyReminderAt` (`reminders.ts`).

## Verification
- Run: `npm --prefix firebase-functions test`
