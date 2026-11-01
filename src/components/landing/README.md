# Role Landing Cards (`src/components/landing`)

## Overview
Cockpit widgets and dashboard cards rendered on role home pages (My Day, Trainee Landing, Student Landing).

## Interface
- `AskStack` (`AskStack.tsx`)
- `AskTheTeam` (`AskTheTeam.tsx`)
- `BnpbReviewCard` (`BnpbReviewCard.tsx`)
- `useCardThread` (`CardConversation.tsx`)
- `CardConversation` (`CardConversation.tsx`)
- `FirstRunCardProps` (`FirstRunCard.tsx`)
- `FirstRunCard` (`FirstRunCard.tsx`)
- `NotReachedCard` (`NotReachedCard.tsx`)
- `OnYouCard` (`OnYouCard.tsx`)
- `PointerCard` (`PointerCard.tsx`)
- `TeamPrayerRow` (`PrayerRows.tsx`)
- `PersonalPrayerRow` (`PrayerRows.tsx`)
- `AddPersonalPrayer` (`PrayerRows.tsx`)
- `QuestionsPointerCard` (`QuestionsPointerCard.tsx`)
- `ReachCard` (`ReachCard.tsx`)

## Invariants
- [NotReachedCard.tsx] const COLLAPSED_LIMIT = 5;
- [NotReachedCard.tsx] const visible = showAll ? listed : listed.slice(0, COLLAPSED_LIMIT);
- [NotReachedCard.tsx] {showAll && listed.length > COLLAPSED_LIMIT && (
- [OnYouCard.tsx] const COLLAPSED_LIMIT = 5;
- [OnYouCard.tsx] const visibleOnYou = showAll ? onYou : onYou.slice(0, COLLAPSED_LIMIT);
- [OnYouCard.tsx] {showAll && onYou.length > COLLAPSED_LIMIT && (

## Side Effects
- [AskTheTeam.tsx] const unsub = onSnapshot(q, (snap) => {
- [OnYouCard.tsx] const unsubInteractions = onSnapshot(
- [PointerCard.tsx] const unsubInteractions = onSnapshot(
- [ToAskPointerCard.tsx] const unsub = onSnapshot(
- [ToAskPointerCard.tsx] const unsub = onSnapshot(
- [UpcomingEventsRsvp.tsx] const unsub = onSnapshot(query(collection(db, "events")), (snap) =>
- [WorklistCard.tsx] window.open(`tel:${contact.phone}`);

## Verification
- Run: `npm test`
