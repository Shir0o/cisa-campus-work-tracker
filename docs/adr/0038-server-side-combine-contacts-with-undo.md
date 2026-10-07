# 0038. Combine contacts runs on the server and can be undone

Date: 2026-10-06

## Status

Accepted. Supersedes the execution and disposal parts of ADR 0026.

## Context

ADR 0026 combined contacts from the browser in chunked batches and deleted the combined-in contact for good, leaving only a sentence in the Activity Log. In practice a Full-timer could not combine with confidence: the field-level effect was hard to see, nothing could be reversed, and the browser could not do the job anyway. Copying another person's interactions, comments or threads is a create that the rules only allow for the author at `request.time`, so any combine with real history is denied. About fourteen collections that store a contact ID (Gathering rosters and attendance, rhythm rosters, home members, outreach names, attendee aliases, comments, notifications, personal prayers, user preferences, inbox state, the Activity Log, cached names on to-dos and visits) were never re-pointed.

## Decision

- The browser builds the preview: a side-by-side diff of both contacts and the result, a per-field choice wherever single values conflict, and the full list of what moves. Lists of people and tags are always unioned.
- A Full-timer-only endpoint in `server.ts` (Admin SDK) performs the combine. It re-points every place that stores the combined-in contact's ID and refreshes cached names. In the same write it stores a **combine record** holding full before-images of both contacts and the ID of every document it moved or rewrote.
- The combined-in contact is still deleted, so search, rosters and pickers stay clean. The combine record is what makes the delete reversible, and it is kept indefinitely.
- **Undo combine** replays the combine record in reverse and leaves later work alone:
  - New documents created on the kept contact after the combine stay where they are.
  - Moved documents go back, carrying any edits made since.
  - Profile fields edited since the combine keep their newer value and are reported as not restored.
  - Only roster or list entries the combine itself rewrote are reverted.
  - If the kept contact was later combined into another contact, undo is blocked until that later combine is undone.
- The default kept contact is the record with more history (interactions, comments and roster entries), not the older one, because its ID is already the one linked most widely. The Full-timer can swap it.
- Fields that ADR 0026 dropped are carried over:
  - `lastContacted` and `lastSeen` take the later value.
  - `createdAt` and `addedBy` come from the earlier record.
  - `interests`, `storyMessageIds` and the legacy per-event `attendance` map are unioned, with the kept contact winning per event.
  - Flags are single values the Full-timer picks between.
- Combines happen one pair at a time; there is no bulk combine. A pair marked **Not the same person** is no longer suggested.

## Considered Options

- **New rule branches so the browser can do it**: rejected. Each affected collection would need a Full-timer exception, and the contacts update rule is already near Firestore's expression ceiling.
- **Soft combine (hide the combined-in contact with a `combinedInto` pointer)**: rejected for the reason ADR 0026 gave. Hidden records leak into queries, search and pickers, and the snapshot gives the same reversibility.
- **No undo, only a better preview**: rejected. Duplicates are often noticed weeks later, and a snapshot costs little to keep.
