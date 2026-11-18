# Core Web Client Utilities & Business Logic (`src/lib`)

## Overview
Client-side domain helpers, Firebase initialization, crypto credential vault, permissions, and markdown parsing.

## Interface
- [calendar](./calendar/README.md): Standing event schedule, recurring rhythm synchronization, and Firebase calendar adapters.
- [data](./data/README.md): Client-side data persistence adapters for collaborative board editing, stages, and Bible study records.
- [sync](./sync/README.md): Attendance correlation engine reconciling campus attendee names, alias matching, and roster event attendance.

## Invariants
- [bibleStudy.ts] const SETUP_LIMITS: Record<keyof StudySetupForm, number> = {
- [bibleStudy.ts] for (const field of Object.keys(SETUP_LIMITS) as (keyof StudySetupForm)[]) {
- [bibleStudy.ts] const limit = SETUP_LIMITS[field];
- [combineClient.ts] if (!response.ok) throw new Error(body.error || fallbackError);
- [credentialVault.ts] export const VAULT_AUDIT_LIMIT = 20;
- [credentialVault.ts] export function credentialAuditFeedQuery(database: Firestore, size: number = VAULT_AUDIT_LIMIT) {
- [feedbackKinds.ts] export const MAX_SCREENSHOT_CHARS = 200000;

## Side Effects

## Verification
- Run: `npm test`
