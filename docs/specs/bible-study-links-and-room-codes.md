# Bible Study Weekly Cadence and Room Codes

* **Author:** Antigravity & User
* **Status:** Approved
* **Date:** 2026-11-02

---

## Overview

This feature enhances the Bible Study management screen (`BibleStudyIndex.tsx`), clarifies the distinction between standing room QR codes and dated permalinks, eliminates confusing jargon, and adds the ability for Full-timers (admins) to clean up and delete obsolete or accidental Room Codes (Entry Points).

Specifically:
1. **Name change for per-week permalinks**: Rename **"Copy staff link"** → **"Copy permanent link"** in the week row actions menu in `BibleStudyIndex.tsx`.
2. **Reframe "Entry point" into Plain English**: Replace confusing technical terms ("Entry point", "slug", "active on code") in the UI with intuitive language: **"Room QR Code"** and **"Standing link"**.
3. **Delete Room Codes (Entry Points)**: Add a safe deletion modal and backing `deleteEntryPoint(db, slug)` helper in both `packages/core/src/data/bibleStudy.ts` and `src/lib/data/bibleStudy.ts` so admins can delete orphaned or duplicate room codes left behind from previous terms.
4. **Preserve the Permanent Room QR Code**: Maintain `/s/:slug` as the standing QR code that continuously resolves to the latest published week for students in the room, with 1-click **Show QR** and **Copy link** (using `entryPointUrl(slug)`).

---

## The Problem

1. **"Staff link" Misnomer**: Staff assumed "Copy staff link" was a private administrative dashboard URL rather than the date-specific permalink for that week's content.
2. **"Entry Point" Jargon**: Terms like "Entry point" and "slug" are developer terms that obscure their real-world purpose (the standing QR code shown on screen in the room).
3. **Inability to Delete Obsolete Entry Points**: When users create a new term or study with a new entry point, or when terms get deleted, duplicate entry points remain forever in Firestore with no UI mechanism to delete them. Full-timers are permitted by Firestore security rules (`allow delete: if isAdmin()`) to delete them, but no frontend UI or data helper exists to perform the deletion.
4. **Weekly Cadence Friction**: Presenting the room code, copying the standing link, or copying a specific week's permanent link should be prominent, reliable, and clear.

---

## Goals

* **Rename to "Copy permanent link"**: Change the action label in the week row actions menu in `BibleStudyIndex.tsx` from "Copy staff link" to "Copy permanent link".
* **Support Deleting Entry Points**: Provide `deleteEntryPoint(db, slug)` in `packages/core/src/data/bibleStudy.ts` and `src/lib/data/bibleStudy.ts`, and a confirmation modal in `BibleStudyIndex.tsx` to let Full-timers remove orphaned room codes.
* **Preserve the Standing Room QR**: Keep `/s/:slug` intact as the durable, always-latest room QR code.
* **Clarify Room Code / Standing Link UI**: Reframe the aside card as **"Room QR Code"** with subtext *"Standing link for attendees"*, using canonical `entryPointUrl(slug)` from `src/lib/publicUrl.ts`.
* **Clean Storage & State Handling**: Clean up `LAST_ENTRY_POINT_KEY` upon deletion and fall back to remaining entry points or existing empty state cleanly.

---

## Non-Goals

* Modifying `BibleStudyRead.tsx` (the reader toolbar already uses generic "Copy link").
* Changing Firestore security rules (rules already allow Full-timers / admins to delete entry points).
* Changing underlying route URLs (`/s/:slug` and `/study/:studyId/:date` remain unchanged).
* Rewriting Markdown reading or editing components (`StudyReaderView.tsx`, `BibleStudyEdit.tsx`).

---

## Critical User Journeys (CUJs)

### CUJ 1: Deleting an Obsolete Room Code / Entry Point
* **Given**: An admin has multiple room codes (e.g. an extra leftover from a deleted term).
* **When**: They select that code, click "Delete room code...", and confirm the dialog.
* **Then**: The entry point document is deleted from Firestore, `LAST_ENTRY_POINT_KEY` is updated/cleared, and the selector smoothly falls back to the remaining active room code (or empty state).

### CUJ 2: Copying a Week's Permanent Link
* **Given**: A student missed this week's study and asks for the reading.
* **When**: Staff opens that week's row actions menu and clicks "Copy permanent link".
* **Then**: The permanent URL (`/study/:studyId/:date`) is copied to the clipboard with clear visual confirmation ("Copied").

### CUJ 3: Presenting or Copying the Standing Room QR Code
* **Given**: Staff is in the room on Wednesday getting ready for attendees to arrive.
* **When**: They click "Show QR" or "Copy link" in the Room QR Code card.
* **Then**: Clicking "Show QR" opens the presenter view (`/bible-study/present?ep=:slug`); clicking "Copy link" writes `entryPointUrl(slug)` to clipboard with ephemeral "Copied" feedback.

---

## Technical Plan (Architecture)

### Architectural Overview

```text
1. DATA LAYER (packages/core/src/data/bibleStudy.ts & src/lib/data/bibleStudy.ts):
   + export async function deleteEntryPoint(db: Firestore, slug: string): Promise<void>
     Calls deleteDoc(doc(db, 'bible_study_entry_points', slug))

2. BIBLE STUDY MANAGEMENT VIEW (src/views/BibleStudyIndex.tsx):
   - Reframe aside card:
     * Header: "Room QR Code"
     * Subtitle: "Standing link for attendees"
     * Actions: [Show QR] and [Copy link] (via entryPointUrl(entryPoint.slug)) with 1.5s copied feedback
     * Delete button: "Delete room code..." (visible to admins)
     * Confirmation modal: mirrors deleteCandidate pattern (role="dialog", aria-modal="true", warns that /s/:slug will deactivate)
     * Deletion handler: calls deleteEntryPoint, updates state, cleans up LAST_ENTRY_POINT_KEY
   - Week Row Actions Menu:
     * Rename "Copy staff link" -> "Copy permanent link"
     * Writes staffPermalinkUrl(m.studyId, m.date) with 1.5s copied feedback

3. FIRESTORE RULES CONTRACT TEST (src/test/firestore.rules.test.ts):
   + Add EP5 tests:
     * Admin can delete an entry point
     * Non-admin / Trainee cannot delete an entry point
```

---

## Alternatives Considered

### Alternative A: Completely Remove `/s/:slug` and Use Only Per-Week Permalinks
* **Pros**: Total architectural simplicity; zero dynamic resolution logic.
* **Cons**: Breaks all existing printed posters, projector bookmarks, and slide decks that already encode `/s/:slug`. Forces leaders to project a new QR code slide every single week instead of relying on a durable flyer.
* **Reason for Rejection**: The standing QR code is a core operational convenience for in-person gatherings; what caused friction was the opaque terminology and inability to delete leftovers.

### Alternative B: Modifying `BibleStudyRead.tsx`
* **Pros**: Symmetry with index menu.
* **Cons**: In `BibleStudyRead.tsx`, the action is already localized as generic "Copy link" (`t('study.copy_link')`). Changing it causes unnecessary churn.
* **Reason for Rejection**: The confusion existed exclusively in `BibleStudyIndex.tsx` where the English string was "Copy staff link".

---

## Detailed Implementation Plan

### Target Files to Create / Modify

#### 1. `packages/core/src/data/bibleStudy.ts` & `src/lib/data/bibleStudy.ts` (Modify)
* **Type / Scope**: Firestore data access modules.
* **Proposed Changes**:
  * Implement and export `deleteEntryPoint(db: Firestore, slug: string): Promise<void>`.
  * Target document: `doc(db, 'bible_study_entry_points', slug)`.

#### 2. `src/views/BibleStudyIndex.tsx` (Modify)
* **Type / Scope**: Main Bible Study admin index component.
* **Proposed Changes**:
  * Reframe aside card:
    * Card header: `"Room QR Code"`.
    * Subtext: `"Standing link for attendees"`.
    * Provide `[Show QR]` button (links to `/bible-study/present?ep=${entryPoint.slug}`) and `[Copy link]` button (writes `entryPointUrl(entryPoint.slug)` with `copiedStanding` feedback).
    * Add `"Delete room code..."` button.
  * Implement `deleteEntryPointOpen` modal:
    * Mirrors standard dialog pattern in the file (`deleteCandidate`).
    * On confirm: calls `deleteEntryPoint(db, entryPoint.slug)`.
    * If `readStored(LAST_ENTRY_POINT_KEY) === entryPoint.slug`, update or clear `LAST_ENTRY_POINT_KEY`.
    * Update local `entryPoints` state and fallback selection.
  * In the week row actions menu:
    * Change label from `"Copy staff link"` to `"Copy permanent link"`.

#### 3. `src/test/dataBibleStudy.test.ts` (Modify)
* **Type / Scope**: Unit tests for Bible Study data functions.
* **Proposed Changes**:
  * Add unit test for `deleteEntryPoint`: verifies `deleteDoc` is called with `bible_study_entry_points/:slug`.

#### 4. `src/test/firestore.rules.test.ts` (Modify)
* **Type / Scope**: Security rules suite.
* **Proposed Changes**:
  * Add rules test asserting an admin can delete an entry point document and an unauthenticated or trainee user fails.

#### 5. `src/test/BibleStudyIndex.test.tsx` (Modify)
* **Type / Scope**: Component tests for BibleStudyIndex.
* **Proposed Changes**:
  * Update tests checking for `"Copy staff link"` to check for `"Copy permanent link"`.
  * Add tests for "Delete room code" flow: clicking button opens confirmation dialog, confirming calls `deleteEntryPoint`, updates selection, and updates storage.
  * Add test for "Copy link" on the Room QR Code card.

### Verification Plan

* **Static Analysis**: `npm run typecheck && npm run lint`
* **Unit Tests**:
  * `npx vitest run src/test/dataBibleStudy.test.ts`
  * `npx vitest run src/test/BibleStudyIndex.test.tsx`
* **Build**: `npm run build`
