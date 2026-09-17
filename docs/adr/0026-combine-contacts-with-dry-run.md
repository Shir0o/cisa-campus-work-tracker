# 0026. Combine contacts with dry-run before submission

Date: 2026-09-17

## Status

Accepted

## Context

Public sign-up forms and repeated event registrations allow duplicate contact records to accumulate without deduplication on creation (#1070). While admin quick-add dedupes at creation time via `findExistingContact`, existing duplicates in the directory had no mechanism to merge into a single canonical record.

Combining contacts is a destructive data operation with significant relationship implications:
- Contacts have co-equal creators and gospel partners (`founders`), caretakers (`carers`), and access lists (`visibleTo`).
- Contacts have profile notes, subcollections (`interactions`, `comments`, `threads`), and references in other collections (`tasks`, `prayers`, `visits`, `events`, `rhythms`).

## Decision

We introduce a dedicated **Combine contacts** tool on `/directory` accessible exclusively to **Full-timers** (`admin`), following the established house pattern of dry-run preview before apply (analogous to `CombineTagsModal`).

1. **Detection**:
   Candidate duplicate pairs/groups are detected using the established `findExistingContact` matching criteria:
   - Identical normalized email (case-insensitive, non-empty), OR
   - Identical normalized phone number (digits only, non-empty), OR
   - Identical normalized name (exact case-insensitive match or word-boundary full token match).

2. **Survivor Selection**:
   - Defaults to the older record (earliest `createdAt`).
   - The Full-timer can explicitly flip the survivor in the dry-run review UI before applying.

3. **Merge & Conflict Resolution**:
   - **Relationship Sets**: `founders`, `carers`, `coCreators`, `tags`, and `visibleTo` are merged as a union of sets (`Set([...A, ...B])`) so neither partner loses access or historical attribution.
   - **Scalar Fields**: The survivor's values are preserved. Missing fields on the survivor are backfilled from the absorbed record.
   - **Notes**: If both contacts have non-empty notes, they are combined with a clear divider.
   - **Subcollections & References**: Subcollections (`interactions`, `comments`, `threads`) under the absorbed contact are copied over to the survivor. External references (`tasks`, `prayers`, `visits`, `events`, `rhythms`) referencing the absorbed contact ID are re-parented to the survivor ID.
   - **Disposal**: The absorbed duplicate record and its migrated subcollection documents are deleted.

4. **Execution & Audit**:
   - Executed via chunked `writeBatch` from the client under Full-timer credentials.
   - A permanent record is written to the Activity Log detailing which contact was combined into which, including prior IDs and merged attributes.

## Considered Options

- **Automatic background dedup on public signup**: Rejected because automatically merging public sign-ups into existing private contact profiles could silently overwrite or conflate people with common names or shared phone numbers without staff verification.
- **Soft tombstoning / archiving duplicate**: Rejected in favor of clean deletion with Activity Log audit trail, keeping Firestore query indices clean and avoiding ghost references in search and roster pickers.
