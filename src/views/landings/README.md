# Role-Specific Landing Views (`src/views/landings`)

## Overview
Targeted cockpit landing views dispatched based on authenticated user role (Full-timer, Trainee, Student, Community).

## Interface
- `Landing` (`Landing.tsx`)
- `LandingCommunity` (`LandingCommunity.tsx`)
- `LandingStudent` (`LandingStudent.tsx`)
- `LandingTrainee` (`LandingTrainee.tsx`)

## Invariants
- Code within this directory adheres to strict TypeScript typing and project ESLint rules.

## Side Effects
- [LandingCommunity.tsx] const unsub = onSnapshot(
- [LandingTrainee.tsx] const unsubContacts = onSnapshot(
- [LandingTrainee.tsx] const unsubStages = onSnapshot(
- [LandingTrainee.tsx] const unsubPrayers = onSnapshot(

## Verification
- Run: `npm test`
