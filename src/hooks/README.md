# Application React Hooks (`src/hooks`)

## Overview
Custom React hooks managing reactive subscriptions, contact interactions, story feeds, and question badge counters.

## Interface
- `useContactInteractions` (`useContactInteractions.ts`)
- `TeamMember` (`useContactStory.ts`)
- `UseContactStoryOptions` (`useContactStory.ts`)
- `ContactPatch` (`useContactStory.ts`)
- `ContactStoryActions` (`useContactStory.ts`)
- `UseContactStoryResult` (`useContactStory.ts`)
- `useContactStory` (`useContactStory.ts`)
- `useMyAskRepliesCount` (`useMyAskRepliesCount.ts`)
- `UseTranslateOptions` (`useTranslate.ts`)
- `useTranslate` (`useTranslate.ts`)
- `useTranslateMarkdown` (`useTranslate.ts`)
- `UndoSnack` (`useUndoSnack.ts`)
- `useUndoSnack` (`useUndoSnack.ts`)
- `useWaitingAsksCount` (`useWaitingAsksCount.ts`)

## Invariants
- Code within this directory adheres to strict TypeScript typing and project ESLint rules.

## Side Effects
- [useContactStory.ts] const unsub = onSnapshot(
- [useContactStory.ts] const unsub = onSnapshot(
- [useContactStory.ts] const unsub = onSnapshot(
- [useContactStory.ts] const unsub = onSnapshot(
- [useContactStory.ts] const unsub = onSnapshot(
- [useContactStory.ts] const unsub = onSnapshot(collection(db, "users"), (snap: any) => {
- [useContactStory.ts] const unsub = onSnapshot(
- [useContactStory.ts] await updateDoc(doc(db, "contacts", c.id), {

## Verification
- Run: `npm test`
