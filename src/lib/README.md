# Core Web Client Utilities & Business Logic (`src/lib`)

## Overview
Client-side domain helpers, Firebase initialization, crypto credential vault, permissions, and markdown parsing.

## Interface
- `AskKind` (`asks.ts`)
- `AskMessage` (`asks.ts`)
- `SubscribeAsksOptions` (`asks.ts`)
- `subscribeAsks` (`asks.ts`)
- `subscribeStaffAsks` (`asks.ts`)
- `askQuestions` (`asks.ts`)
- `askQuestionsBy` (`asks.ts`)
- `askRepliesOf` (`asks.ts`)
- `askAnswered` (`asks.ts`)
- `askWaitedDays` (`asks.ts`)
- `askWaitedWords` (`asks.ts`)
- `askWaitedText` (`asks.ts`)
- `AskStack` (`asks.ts`)
- `askStacksFor` (`asks.ts`)
- `askTakenBy` (`asks.ts`)
- [calendar](./calendar/README.md): Standing event schedule, recurring rhythm synchronization, and Firebase calendar adapters.
- [data](./data/README.md): Client-side data persistence adapters for collaborative board editing, stages, and Bible study records.
- [sync](./sync/README.md): Attendance correlation engine reconciling campus attendee names, alias matching, and roster event attendance.

## Invariants
- [bibleStudy.ts] const SETUP_LIMITS: Record<keyof StudySetupForm, number> = {
- [bibleStudy.ts] for (const field of Object.keys(SETUP_LIMITS) as (keyof StudySetupForm)[]) {
- [bibleStudy.ts] const limit = SETUP_LIMITS[field];
- [bnpb.ts] throw new Error('That contact is not visible to you.');
- [combineClient.ts] if (!response.ok) throw new Error(body.error || fallbackError);
- [credentialVault.ts] export const VAULT_AUDIT_LIMIT = 20;
- [credentialVault.ts] export function credentialAuditFeedQuery(database: Firestore, size: number = VAULT_AUDIT_LIMIT) {
- [feedbackKinds.ts] export const MAX_SCREENSHOT_CHARS = 200000;

## Side Effects
- [asks.ts] return onSnapshot(
- [asks.ts] await addDoc(col(), {
- [asks.ts] await addDoc(col(), {
- [asks.ts] await addDoc(col(), {
- [asks.ts] void sendNotification({
- [asks.ts] await deleteDoc(ref(replyId));
- [bnpb.ts] return onSnapshot(
- [bnpb.ts] return onSnapshot(

## Verification
- Run: `npm test`
