# Role-Specific Landing Views (`src/views/landings`)

## Overview
Targeted cockpit landing views dispatched based on authenticated user role (Full-timer, Trainee).

## Interface
- `Landing` (`Landing.tsx`)
- `LandingTrainee` (`LandingTrainee.tsx`)

## Invariants
- Code within this directory adheres to strict TypeScript typing and project ESLint rules.

## Side Effects
- [LandingTrainee.tsx] const unsubContacts = onSnapshot(
- [LandingTrainee.tsx] const unsubStages = onSnapshot(
- [LandingTrainee.tsx] const unsubPrayers = onSnapshot(

## Verification
- Run: `npm test`
