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
   - For recurring events, new instances inherit the series roster. When adding an attendee to a recurring instance, admins are prompted to add them to either *this gathering only* or *all future gatherings in this series*.
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
