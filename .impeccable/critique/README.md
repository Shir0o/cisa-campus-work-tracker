# Critique briefs

Each sub-issue in a critique epic names one screen and one role to sign in as. That second line is where this epic went wrong six times: the brief said "Trainee" for routes a Trainee cannot open, so the pass measured a role that was already being bounced to `/`, and the question came back as a fresh issue per screen.

## The sign-in role must be a role the route admits

Read `src/test/permissions.test.tsx` before writing the line. Its `canAccessRoute()` matrix lists every route a role may open and asserts every other route is denied, so it answers "who can see this screen" without a browser. It is the source of truth, not a copy of one.

If the role you were told to use is bounced, measure the page as the role that owns it and say so at the top of the report. The bounced role is a **role question**, and role questions are filed **once per pattern**, not once per screen. A second screen with the same deny is a row in the first issue, not a second issue.

## Why this is a rule and not a reminder

Trainees are an allowlist, not a rung on the ladder, but several `ROUTE_MIN_ROLE` floors in `src/lib/permissions.ts` were written as if they were one. `/history` reads `manager` and `/coordination` reads `operator`, and a Trainee may open neither. While those two shapes disagree, whoever writes the next brief is guessing. Check the matrix, not the floor.

Decided precedent: a Trainee keeps the personal prayer card and does not read the team's list or its testimonies (`/prayer`, `/answered`), recorded beside the allowlist in `src/lib/permissions.ts`.
