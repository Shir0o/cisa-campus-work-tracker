# 0023: Staged attendance sync with remembrance from attd

## Status
Accepted

## Context
Campus ministers take attendance in the local-first `~/attd` app during weekly
Gatherings and Bible studies, then re-enter it in CISA Campus Work Tracker, the
team's system of record for follow-up and Gathering history.

A direct write from attd into Firestore is unsafe. attd names are written in the
room and may be nicknames, abbreviations, or typos; dates and repeating events
can be mismatched; and an unreviewed push could overwrite production attendance.
But making a Full-timer remap every student every week would remove the value of
the integration.

## Decision
1. **One-way staged intake.** attd POSTs a session to an authenticated intake
   endpoint (`POST /api/attendance-sync` by default) with a team `Sync Token` in
   the `x-sync-token` header. The handler writes a `pending_attendance_imports`
   document and never touches `contacts`, `events`, or attendance.
2. **The payload carries identity and recurrence.** It includes `attdEventId`,
   `eventName`, `frequency`, `repeatingDays`, `eventTime`, `sessionDate`, and
   each attendee's `memberId`, `attendee`, `status`, and `isLate`.
3. **Correlation is a cascade.** The target Rhythm is resolved by a remembered
   `attdEventId` mapping first, then by weekly cadence plus title similarity,
   then the Gathering is found under that Rhythm by `sessionDate`. If no
   occasion exists, the dry run proposes creating one.
4. **Attendee memory is explicit.** Attendee aliases keyed by `attdMemberId`
   match at full confidence. Exact normalized names are next, fuzzy names are
   suggestions, and an unmatched row defaults to a walk-in contact that the
   reviewer can repoint at an existing Contact.
5. **Confirmation is one atomic client batch.** A Full-timer reviews the dry run
   on `/attendance`, resolves conflicts per row (or accepts all attd marks),
   chooses or creates the Gathering, and confirms. The batch updates the
   Gathering attendance, creates walk-ins, saves attendee aliases and the event
   mapping, and marks the import confirmed.
6. **The token is team configuration.** It lives in `settings/integrations`,
   readable and writable only by Full-timers. attd exchanges it once in Settings
   so a room-side phone never needs a Firebase login.

## Consequences
- Unreviewed external data cannot silently rewrite attendance.
- The second and later syncs get cheaper: aliases and event mappings turn
  matching into a lookup instead of repeated human work.
- The importer only ever adds or updates marks represented in the payload; it
  does not remove roster members or delete attendance.
- The bridge is one-way in this iteration. attd does not read CISA contacts or
  Gatherings, and real-time in-room sync is out of scope.
