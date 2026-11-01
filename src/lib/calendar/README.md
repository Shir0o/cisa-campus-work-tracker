# Calendar & Rhythm Sync (`src/lib/calendar`)

## Overview
Standing event schedule, recurring rhythm synchronization, and Firebase calendar adapters.

## Interface
- `CalCategory` (`calendarSync.ts`)
- `CAL_CATEGORIES` (`calendarSync.ts`)
- `CAL_CAT_BY_ID` (`calendarSync.ts`)
- `CalRRule` (`calendarSync.ts`)
- `CalRawEvent` (`calendarSync.ts`)
- `CalAwayItem` (`calendarSync.ts`)
- `CalContextItem` (`calendarSync.ts`)
- `calStartOfDay` (`calendarSync.ts`)
- `calAddDays` (`calendarSync.ts`)
- `calStartOfWeek` (`calendarSync.ts`)
- `calISO` (`calendarSync.ts`)
- `calTimeLabel` (`calendarSync.ts`)
- `calEventEnd` (`calendarSync.ts`)
- `expandCalEvent` (`calendarSync.ts`)
- `expandCalEvents` (`calendarSync.ts`)

## Invariants
- Code within this directory adheres to strict TypeScript typing and project ESLint rules.

## Side Effects
- [calendarSync.ts] const v = typeof localStorage !== 'undefined' ? localStorage.getItem(CAL_SYNC_LS) : null;
- [calendarSync.ts] localStorage.setItem(CAL_SYNC_LS, on ? '1' : '0');
- [calendarSync.ts] unsubSnapshot = onSnapshot(

## Verification
- Run: `npm test`
