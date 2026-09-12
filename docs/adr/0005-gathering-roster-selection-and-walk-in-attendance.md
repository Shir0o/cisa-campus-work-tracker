# 0005: Gathering roster selection and walk-in attendance model

## Status
Accepted

## Context
Previously, when taking attendance for gatherings on `/attendance` (desktop and mobile), every single contact across the entire organization database was listed by default under "We missed" for every session unless explicitly marked present. For campus teams with hundreds of contacts across outreach and follow-up pipelines, this caused significant cognitive noise and degraded the meaning of "We missed".

Furthermore, gatherings have distinct attendee circles (e.g. weekly fellowship regulars, specific Bible studies, community dinners). Admins need to define who usually comes, while still allowing newcomers and walk-ins to be recorded and added to the roster without friction or leaving the attendance screen.

## Decision
1. **Explicit Gathering Roster (`Event.roster`)**:
   - Each `Event` record includes an optional `roster: string[]` of contact IDs who are expected to attend.
   - When creating an event, the roster defaults to empty (`[]`) unless contacts are selected by the user.
   - **Amended by issue #957 (ADR 0016):** a recurring gathering's roster now lives on its own `Rhythm` record, not on each occasion. `resolveRoster(gathering, rhythm, now)` reads the Rhythm's roster with the occasion's `rosterOverride` layered on top, live, for today and every future occasion — a roster edit takes effect immediately, with no "this one or all future?" prompt. A Gathering dated in the past is **frozen**: it keeps reading back whatever roster was recorded for it at the time (`rosterOverride ?? roster ?? []`), so a later roster change never rewrites history. A one-off Gathering (no Rhythm) is unaffected — it still just reads its own `roster`.
2. **"We Missed" Scope**:
   - "We missed" is strictly bounded: only contacts belonging to the gathering's `roster` (or those explicitly marked `'absent'`) appear under "We missed".
   - Contacts outside the roster are omitted from the absence list, keeping the missed roster clean and actionable.
3. **Walk-in Discovery & Integration**:
   - An inline search/add input allows finding any contact in the organization.
   - Once a newcomer attends, they can be added to the gathering's regular roster for future sessions.
   - **No retroactive penalty**: A newcomer's absence prior to their first appearance/roster addition does not count against them in historical absence metrics or "missed $N$ gatherings" counts.
4. **Fast Inline Contact Creation**:
   - If a walk-in is not yet in the contacts database, they can be created immediately from the gathering search input by entering just their name. Additional profile details can be deferred and edited later.
5. **Role Gating**:
   - Roster configuration (editing the regular attendees list for an event or recurring series) is restricted to Full-timers / Admins (`isAdmin`).

## Consequences
- Gathering attendance rosters reflect realistic expected attendees rather than the entire campus contact database.
- "We missed" metrics and follow-up to-do suggestions focus accurately on regular community members who were absent.
- Newcomers can be checked in instantly with zero required fields beyond their name, reducing friction during live gatherings.
