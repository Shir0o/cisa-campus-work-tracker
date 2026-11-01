# Attendance & External Event Sync (`src/lib/sync`)

## Overview
Attendance correlation engine reconciling campus attendee names, alias matching, and roster event attendance.

## Interface
- `AttdAttendanceStatus` (`attdCorrelator.ts`)
- `AttdSyncRecord` (`attdCorrelator.ts`)
- `AttdSyncPayload` (`attdCorrelator.ts`)
- `AttendeeMatchType` (`attdCorrelator.ts`)
- `AttendeeAlias` (`attdCorrelator.ts`)
- `AttdEventMapping` (`attdCorrelator.ts`)
- `AttendeeCorrelation` (`attdCorrelator.ts`)
- `AttendanceConflict` (`attdCorrelator.ts`)
- `AttendancePreviewStats` (`attdCorrelator.ts`)
- `AttendancePreview` (`attdCorrelator.ts`)
- `PendingAttendanceImport` (`attdCorrelator.ts`)
- `AttdIntegrationSettings` (`attdCorrelator.ts`)
- `AttendanceMark` (`attdCorrelator.ts`)
- `FUZZY_MATCH_THRESHOLD` (`attdCorrelator.ts`)
- `normalizeName` (`attdCorrelator.ts`)

## Invariants
- [attdSync.ts] throw new Error('Choose a Rhythm before confirming.');
- [attdSync.ts] throw new Error('Choose a Gathering or create one.');

## Side Effects
- [attdSync.ts] return onSnapshot(
- [attdSync.ts] await updateDoc(doc(db, PENDING_IMPORTS_COLLECTION, id), {

## Verification
- Run: `npm test`
