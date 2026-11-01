# Web Client Data Adapters (`src/lib/data`)

## Overview
Client-side data persistence adapters for collaborative board editing, stages, and Bible study records.

## Interface
- `subscribePublishedStudyMeetings` (`bibleStudy.ts`)
- `subscribeEntryPoints` (`bibleStudy.ts`)
- `subscribeStudyMeetings` (`bibleStudy.ts`)
- `subscribeMeeting` (`bibleStudy.ts`)
- `saveMeeting` (`bibleStudy.ts`)
- `setMeetingPublished` (`bibleStudy.ts`)
- `deleteMeeting` (`bibleStudy.ts`)
- `subscribeStudy` (`bibleStudy.ts`)
- `subscribeStudies` (`bibleStudy.ts`)
- `subscribeEntryPoint` (`bibleStudy.ts`)
- `createStudy` (`bibleStudy.ts`)
- `createEntryPoint` (`bibleStudy.ts`)
- `setActiveStudy` (`bibleStudy.ts`)
- `deleteStudy` (`bibleStudy.ts`)
- `softDeleteBoardDoc` (`board.ts`)

## Invariants
- Code within this directory adheres to strict TypeScript typing and project ESLint rules.

## Side Effects
- [bibleStudy.ts] return onSnapshot(
- [bibleStudy.ts] return onSnapshot(
- [bibleStudy.ts] return onSnapshot(
- [bibleStudy.ts] return onSnapshot(
- [bibleStudy.ts] await setDoc(
- [bibleStudy.ts] await updateDoc(meetingRef, {
- [bibleStudy.ts] await deleteDoc(doc(db, 'bible_study_meetings', meetingId));
- [bibleStudy.ts] return onSnapshot(

## Verification
- Run: `npm test`
