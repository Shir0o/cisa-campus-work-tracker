# Top-Level Route Views & Pages (`src/views`)

## Overview
Full-page router views covering contact directory, The Journey board, prayers, gatherings, coordination notes, and credential vault.

## Interface
- `parsePrayerDate` (`AnsweredList.tsx`)
- `AnsweredList` (`AnsweredList.tsx`)
- `AroundTheTeam` (`AroundTheTeam.tsx`)
- `Ask` (`Ask.tsx`)
- `Attendance` (`Attendance.tsx`)
- `UpcomingGathering` (`AttendanceMobile.tsx`)
- `AttendanceMobile` (`AttendanceMobile.tsx`)
- `BibleStudyEditor` (`BibleStudyEditor.tsx`)
- `BibleStudyIndex` (`BibleStudyIndex.tsx`)
- `BibleStudyPresent` (`BibleStudyPresent.tsx`)
- `BibleStudyRead` (`BibleStudyRead.tsx`)
- `CombineContacts` (`CombineContacts.tsx`)
- `CombineTags` (`CombineTags.tsx`)
- `TeamMember` (`CoordinationNotes.tsx`)
- `NoteFormInitial` (`CoordinationNotes.tsx`)
- [landings](./landings/README.md): Targeted cockpit landing views dispatched based on authenticated user role (Full-timer, Trainee, Student, Community).

## Invariants
- [FeedbackList.tsx] throw new Error(`Server returned ${response.status}`);
- [PrayerList.tsx] import { MAX_ANSWER_PHOTOS, uploadPrayerAnswerPhotos } from '../lib/prayerPhotos';
- [PrayerList.tsx] const remaining = MAX_ANSWER_PHOTOS - answerPhotos.length - newPhotoFiles.length;

## Side Effects
- [AnsweredList.tsx] const unsubContacts = onSnapshot(
- [AnsweredList.tsx] const unsubPrayers = onSnapshot(
- [AroundTheTeam.tsx] const unsubContacts = onSnapshot(
- [AroundTheTeam.tsx] const unsubInteractions = onSnapshot(
- [Ask.tsx] const unsubContacts = onSnapshot(
- [Ask.tsx] const unsubInteractions = onSnapshot(
- [Ask.tsx] const unsubEvents = onSnapshot(
- [Attendance.tsx] const unsubscribeContacts = onSnapshot(

## Verification
- Run: `npm test`
