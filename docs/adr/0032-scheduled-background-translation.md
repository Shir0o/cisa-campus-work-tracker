# 0032. Scheduled background translation of user-generated content

Date: 2026-09-23

## Status

Accepted

## Context

User-authored content (prayers, interactions, contact notes, to-dos, coordination notes) is stored in the author's original language. Previously, reading translation (ADR 0027) was triggered strictly on-demand on the client whenever a Spanish-mode reader viewed an item that was not yet cached. This introduced visual loading delay and skeletons for users toggling into or reading in Spanish. Furthermore, translating large batches purely on-demand created bursty calls to Gemini and the Firestore `translations` cache.

## Decision

- **Scheduled Nightly Translation Cron.** A 2nd-gen Firebase Cloud Function (`onSchedule({ schedule: '0 4 * * *', timeZone: 'America/Los_Angeles' })`) runs nightly at 4:00 AM off-peak.
- **Round-Robin Progressive Sweeping.** The job advances through user-authored collections in fixed round-robin order (`prayers` → `interactions` → `contacts` → `todos` → `coordinationNotes`).
- **Persistent Cursor.** Progress is tracked in a metadata document at `system/translationCursor` (`currentCollection`, `lastDocId`, `updatedAt`). When one collection is exhausted, the cursor cycles to the next collection.
- **Batch Cache Verification Before AI.** The job extracts translatable text fields, computes standard sha256 hashes (`sha256('es:' + text)`), batches checks against Firestore `translations/{hash}`, and only sends genuinely uncached strings to Gemini.
- **Controlled Batches.** Each nightly run translates up to 200–300 uncached items (chunked in requests of 15 strings) to maintain fast, reliable execution well within Cloud Function timeouts and free quota limits.
- **Graceful Client Fallback Retained.** The client UI retains its on-demand fallback fetch (`POST /api/translate`) so any newly created content not yet visited by the nightly cron can still be translated dynamically when viewed.

## Consequences

- Spanish-mode readers experience instantaneous reading with pre-warmed translations already present in Firestore L3 cache.
- Gemini quota usage is smoothed out and bounded, costing pennies per month.
- Requires `GEMINI_API_KEY` secret access configured for the scheduled function.
- The client app and Firestore schema require zero breaking changes: translations continue to reside in the global `translations` cache collection.
