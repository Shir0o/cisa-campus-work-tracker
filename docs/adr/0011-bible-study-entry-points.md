# 0011: Bible study QRs point at a durable Entry point, not a Study or a Meeting

## Status
Accepted

## Context
Issue [#822](https://github.com/Shir0o/cisa-campus-work-tracker/issues/822) — "bible study needs a index and not just replace the same one every week" — surfaced that the Bible study feature had no way to reach any week but the newest, and no record for a Study at all. `studyId` was a string hardcoded in editor component state (`'romans-fall26'`), there was no `studies` collection, and the QR panel rendered a hand-authored decorative SVG that encoded nothing.

Design work in `docs/design/bible-study/README.md` had settled **"One QR per Meeting; `/s/:studyId` redirects to newest"**. Grilling the issue reversed that: the QR is *displayed on a leader's phone in the room*, not printed, and students scan it fresh each week and rarely return to a past week. A code that changes weekly is a weekly chore with no audience for its permalinks.

That leaves the question of what a durable QR points at, since the content behind it changes every week and the Study behind *that* changes every term. Three shapes were considered:

1. **A slug per Study** — `/s/romans-fall26`, then `/s/john-spring27`. Simple and direct, but the QR must be regenerated and re-shown every term, which is the same chore the weekly QR imposed, just less often.
2. **Binding to a Rhythm** — resolve through "the Wednesday Bible Study", which the glossary already defines as the durable gathering a Study is taught on. Rejected on inspection: a Rhythm is *derived*, not stored — it is the anchor `Event` found via `parentEventId` (`src/lib/gatheringViewModel.ts:155`). It has no slug and no identity of its own, so binding to one means persisting an opaque event id and depending on the anchor event surviving.
3. **A standalone Entry point record** — `{ slug, name, activeStudyId }`, owned by nothing else.

## Decision

1. **A QR encodes an Entry point, never a Study and never a Meeting.** Resolution is three hops: slug → active Study → newest published Meeting. `/s/:slug` is the public reader.

2. **The Entry point is a standalone record.** It is not bound to a Rhythm, an Event, or a Study's own identity. Starting a new term reassigns `activeStudyId`; the slug and therefore the QR never change.

3. **Publishing is the act that changes what a scan shows.** Unpublishing is permitted and falls back to the previous published Meeting *with its date shown* — never a silent substitution. A Meeting may be hard-deleted only while unpublished. Three empty states are distinct: nothing published yet, nothing ever published, and no active Study (between terms).

4. **Splits are two Entry points, not one divided Meeting.** `siblingId` is removed from the `Meeting` type, the data mapper, and `firestore.rules`; it was declared in three places and had behavior in none. A week taught in two rooms means a second Entry point, populated with the editor's duplicate-week action. The shared opening and closing the earlier design promised become duplicated content, accepted.

5. **The QR's origin comes from `VITE_PUBLIC_APP_URL`**, defaulting to `https://cisa-campus-work-tracker.pages.dev`, following the `VITE_FIREBASE_AUTH_DOMAIN` pattern that already handles this prod/QA domain pair. It is never derived from `window.location.origin`, which would render an unreachable `localhost` QR in front of a room.

6. **The archive is for Full-timers only.** `/bible-study` becomes an index of a Study's Meetings; `/bible-study/:meetingId` is the editor. There is no public archive — students scan and read on the spot. `/study/:studyId/:date` remains a public but unlisted staff permalink carrying `noindex`, because the Firestore rule already serves any published Meeting to anyone and a UI gate over an open door would misrepresent it as protected.

## Consequences
- The table QR is generated once and never reprinted or re-shown differently, across terms and across Studies.
- Three hops must resolve before a student sees anything, and each hop is a failure mode with its own empty state. This is the cost paid for the durable URL.
- A future reader encountering `/s/cisa-wednesday` will not find a Study by that name. That indirection is the point of this record.
- This ADR reverses three rows previously marked Settled in `docs/design/bible-study/README.md` (Entry, Desktop, Splits); those rows are edited in place to match, and the rejected alternatives live here.
- The index screen and present mode must work on a phone, which retires the earlier "Desktop: admin editing only" position.
