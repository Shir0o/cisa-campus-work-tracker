# Core Shared Domain Logic (`packages/core/src`)

## Overview
Pure, platform-agnostic business logic, domain models, permission evaluation, role simulation, and state derivations shared across the web application and React Native mobile client.

## Interface
- Domain Types: `Contact`, `Interaction`, `Stage`, `BoardDoc`, `PrayerRecord`, `ChatMessage`, `ChatRoom`, `Gathering`, `Study`, `Meeting`, `EntryPoint`, `AppRole`, `Touch` (`types.ts`)
- `ROLE_LEVEL`, `ROLE_LABELS`, `OWNER_VIEW_ROLES`: Role hierarchy mapping and user-facing role display labels (`permissions.ts`)
- `ROUTE_MIN_ROLE`, `TRAINEE_ROUTES`, `canAccessRoute`: Route access authorization rules and Trainee explicit route allowlist (`permissions.ts`)
- `seesAllPeople`, `visibleToOf`, `canSeeContact`: Contact visibility evaluation and denormalized `visibleTo` access list generation (`permissions.ts`)
- `canManageCollaborators`, `canRemoveContactMember`, `canReleaseContact`: Access control for collaborator management and self-release from queue (`permissions.ts`)
- `canSimulateRole`, `getEffectiveRole`, `OWNER_EMAIL`: Role simulation permissions and effective role resolution for admin and app owner (`permissions.ts`)
- `applyRoster`, `isFullTimer`, `isTrainee`, `fullTimerIds`, `traineeIds`: Team role state cache and staff tier lookups (`walking.ts`)
- `buildAroundTeamCards`: Aggregates unreviewed team activity for Full-timer review (`aroundTeam.ts`)
- `calculateAttentionFeed`: Derives action items waiting on the current user (`myday.ts`)
- `computeDayGoalProgress`: Evaluates new connections against daily goal target (`goal.ts`)
- `docSortOrder`, `isTrashedBoardDoc`: Coordination notes pinned status and date-descending sort comparator (`board.ts`)
- `carersAfterCollaboratorRemoval`: Recomputes carer ties after collaborator removal (`carers.ts`)
- [data](./data/README.md): Firestore and Realtime Database reactive data-access adapters

## Invariants
- `canAccessRoute`: Trainees (`manager`) operate via explicit allowlist (`TRAINEE_ROUTES`), not ladder rungs; `/outreach` is restricted to admin and viewer exclusively (`permissions.ts`).
- `canRemoveContactMember`: A founder (`founders`) can only ever be removed by a Full-timer (`admin`); collaborators cannot remove founders (`permissions.ts`).
- `seesAllPeople`: Trainees are strictly scoped to their tied contacts; Full-timers, Students, and Community see all non-private contacts within their access levels (`permissions.ts`).
- `applyRoster`: Full-timers stand over all trainees team-wide; 1:1 mentor/trainee silos are prohibited (`walking.ts`).
- `docSortOrder`: Pinned docs always sort before unpinned docs; secondary sort is date descending (`board.ts`).
- `carersAfterCollaboratorRemoval`: Removing a collaborator immediately purges their carer tie unless independently held (`carers.ts`).

## Side Effects
- Updates module-scoped in-memory state caches (`FULL_TIMER_UIDS`, `TRAINEE_UIDS`, `CURRENT_PAIRINGS`, `CURRENT_DAY`) (`walking.ts`, `partners.ts`).
- Delegated Firestore and Realtime Database operations executed through [data](./data/README.md) adapters.

## Verification
- Run: `npm --prefix packages/core test`
