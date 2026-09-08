# 0012: Meetings autosave in place and become collaborative; Publish stays manual

## Status
Accepted

## Context
The week editor (`src/views/BibleStudyEditor.tsx`) saved only on a deliberate Save click, backstopped by `useUnsavedGuard` — a guard built for this editor alone (its docstring names "the three ways a Full-timer can lose a week's writing") and its only consumer. A grilling session (2026-09-07) established the motive: never lose a week's writing, and stop clicking Save — not live-sync for the room.

The constraint that shaped everything: there is **one Firestore document per Meeting** holding `md`, `sections`, `title`, `date`, and `published`, and present mode plus the public reader subscribe live to meetings where `published == true`. Whatever is saved *is* what students' phones render. The Board's CoordinationNotes pages had already proven the alternative editing architecture in this repo: a Yjs doc over Realtime Database (`RtdbYjsProvider`), a debounced Firestore projection as the durable copy, awareness-based presence, and a Tier 0 fallback to Firestore-only editing when RTDB is absent or degraded.

Three shapes were considered for where unsaved work lives:

1. **Autosave in place** — one doc, Publish stays a manual toggle. The normal write-then-publish workflow (draft the week unpublished, publish for the room) keeps students off half-written text; the one exposed path is re-editing an already-published week while the room reads.
2. **A Draft concept** — autosave writes to a draft field or document; Publish promotes draft to student-visible. Principled, but adds a new domain concept, rules, editor data flow, and promotion logic for a path the workflow rarely walks.
3. **Split behavior** — autosave unpublished weeks, manual save published ones. Rejected on inspection: the same editor behaving differently by publish state is surprising in exactly the way this record exists to prevent.

For concurrency, two leaders editing one Meeting were already last-writer-wins (the editor freezes its form at load and ignores live updates); autosave would have made that clobber ambient and silent.

## Decision

1. **Autosave writes the student-facing document in place.** There is no Draft. Publishing remains a deliberate toggle on the same document, never an automatic consequence of editing. The accepted cost: editing a published Meeting streams changes to the room at the debounce rate.

2. **Concurrent editing is real-time collaboration, not last-writer-wins.** Meetings follow The Board's architecture: edits flow through a Yjs doc replicated over RTDB (`bible_study_meetings_rtdb/{meetingId}`, rules mirroring `board_docs_rtdb`), and a debounced projection persists the merged state to the Firestore meeting document. This replaces the editor's freeze-at-load behavior; the RtdbYjsProvider's hardcoded `board_docs_rtdb` base path is parameterized, and first open seeds from Firestore `md` behind the existing `claimSeed` guard.

3. **The textarea stays; collab is a hand-rolled Y.Text↔textarea binding.** TipTap was rejected: it would rebuild every Section/Prompt/Blank/Passage insert button and force the markdown dialect through a rich-text round-trip, visibly changing the writing UX for no collab gain. Markdown remains the source of truth and the insert helpers keep working on the selection. Desktop-only scope dodges mobile IME edge cases.

   **Amended by [ADR 0014](0014-bible-study-reading-deck-and-editor-document-index.md):** the `Y.Text` binds to the **whole-document textarea** — one `Y.Text` over the entire Meeting `md`, not per-Section. `md` remains one string and the single source of truth; Sections stay derived, so the binding target is the document, and the editor's outline and preview are read models over it. The desktop-only scope is reaffirmed.

4. **Tier 0 fallback, mirroring The Board.** When `rtdb` is null or the provider reports degraded, the editor runs single-user with plain debounced autosave to Firestore. Autosave never depends on RTDB being enabled; collaboration is progressive enhancement on top.

5. **Cadence mirrors Pages: 1200ms** for body markdown, **800ms** for title and date. The debounce is also the rate at which a published week's text changes under students' thumbs — one cadence, no published/unpublished split.

6. **Save state is honest.** "Saving… / Saved · just now", and on failure "Couldn't save" with auto-retry on the next edit or reconnect. Pages' optimistic silent save was rejected: with no Firestore offline persistence in this app, an offline write genuinely fails, and autosave that says "Saved" during a failed write is precisely the data loss this decision exists to prevent.

7. **Presence is name chips only** ("Ana is editing") via the existing awareness plumbing. Remote cursors in a textarea binding were rejected as machinery without an audience.

8. **The unsaved-changes guard is deleted, not idle.** Autosave plus the RTDB update log shrinks the loss window to milliseconds, retiring `useUnsavedGuard`'s reason to exist. Its sole consumer gone, `src/lib/navGuard.ts` and `src/test/navGuard.test.tsx` are removed with the cutover, along with the editor tests pinning guard behavior. The promise "a Full-timer can't lose a week's writing" is now carried by autosave instead of an interception dialog.

## Consequences
- Editing a published Meeting changes what students read at the debounce rate. This is accepted, not overlooked; if re-editing published weeks while the room reads becomes a real workflow, a Draft is the recorded escape hatch.
- Two leaders typing simultaneously see each other's edits live — a side effect beyond the stated motive, inherent to choosing collaboration over last-writer-wins.
- The RTDB log becomes part of the durability story: the Firestore projection can lag it by one debounce, and a meeting's truth between editors is the Yjs doc, not the Firestore copy.
- A future reader will find a Meeting with an RTDB twin and no Draft and wonder why both ends were chosen; they are here.
