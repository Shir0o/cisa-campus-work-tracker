# 0022. Co-Creator Contact Collaboration, Mobile Sharing, and Read-Only Impersonation

Date: 2026-09-14

## Status

Accepted

## Context

In CISA Campus Work Tracker, campus ministers and trainees partner to track contacts and interactions. The data model allows contacts to specify an assigned caregiver (`owner`), a creator (`createdBy`/`addedBy`), and collaborators (`coCreators`, including gospel partners).

However, three distinct gaps existed in contact collaboration and authorization:
1. **Co-Creator Privilege Disparity**: Only the primary `owner` or an Admin could add or remove people from `coCreators`. Co-creators (gospel partners who actively share ministry responsibility for a student) were unable to loop in other teammates or manage who else can see the contact.
2. **Missing Mobile Feature**: The mobile native app (`ContactScreen`) had no UI for viewing or managing `coCreators`, meaning contact sharing could only be handled from desktop web.
3. **Impersonation Privilege Leak ("See it as their view")**: The "See it as their view" feature allowed Full-timers to audit layouts and views as other roles (`manager`, `operator`, `viewer`). However, because impersonation was purely client-side while the backend Firebase session retained the Full-timer Admin token, mutating actions executed with full Admin privileges against Firestore rules (`isAdmin() == true`), allowing operations that actual non-admins were blocked from doing.

## Decision

We adopt three aligned decisions:

1. **Co-Creator Collaborator Rights**:
   - Members listed in `coCreators` have full collaborator management privileges for that contact: they can add teammates to `coCreators` and remove collaborators from `coCreators`.
   - The primary `owner` assignment remains strictly protected: only the current `owner` or an Admin can reassign pastoral ownership (`owner`).
   - The original contact creator (`createdBy`/`addedBy`) cannot be removed from the contact's access list.
   - Firestore security rules explicitly split updates to `owner` and `coCreators`:
     - Updates modifying `owner` require `isAdmin()` or `existing().owner == request.auth.uid`.
     - Updates modifying only `coCreators` are permitted if `isAdmin()`, `existing().owner == request.auth.uid`, or `request.auth.uid in existing().coCreators`.

2. **Mobile Collaborator Management**:
   - A dedicated "Who else can see" section is added to `ContactScreen` on mobile, mirroring the web application model.
   - Displays the current collaborators, an "+ Add someone" trigger sheet/picker, and remove controls for users with sharing privileges (`isAdmin || isOwner || isCoCreator`).

3. **Read-Only Impersonation Mode**:
   - "See it as their view" is explicitly defined as a **read-only preview** tool for auditing and verification.
   - While impersonation is active, write controls across both web and mobile apps are disabled or hidden with clear visual indication (`(read-only preview)`), preventing unintended admin writes and eliminating the client/server privilege discrepancy.

## Consequences

- **Pros**:
  - Gospel partners and co-owners can seamlessly collaborate and add teammates to contacts on both web and mobile without asking an admin.
  - Pastoral ownership (`owner`) remains tamper-proof against accidental transfer.
  - Full-timer admins auditing other roles via "See it as their view" cannot accidentally perform unintended mutations under a simulated identity.
- **Cons**:
  - Admins wishing to test actual mutation permissions for non-admin roles must use authentic test account credentials (or emulator test suites) rather than the lightweight client-side preview.

## Amendment: the contact has no owner, and co-creators are co-equal founders (#1048, #1049, #1053, #1054)

The original decision was written against a contact that carried a single
pastoral caregiver (`owner`). That field is gone and there is nothing to
transfer, and "co-creator" no longer means a guest on someone else's contact.

- **There is no `owner` and no care transfer.** The `owner`/caregiver field
  and its reassignment rule were removed (#1053). A contact is shared through
  the persisted ties `createdBy`/`addedBy`, `founders`, `coCreators` and
  `carers`, and the sharing rules read those ties directly rather than through
  a protected owner assignment (#1051, #1055).
- **Co-creators are co-equal founders, not guests.** A person brought in by a
  Gospel Partners pair is founded by both of them: the founding set
  (`founders`) is written on the contact at creation (#1048, #1049), so each
  partner is a co-equal creator of the contact rather than a guest on the
  other's. Decision 1's collaborator management therefore extends to the
  founding set as well — a founder can add and remove deliberately added
  collaborators (`coCreators`), exactly as a co-creator can.
- **Removal is asymmetric and deliberate.** A deliberately added collaborator
  (`coCreators`) can be removed by anyone with sharing rights; a founder only
  by a Full-timer, for the genuine-mistake case (#1054).
- **Decision 1's sharing-rule split survives in new form.** Firestore rules now
  gate changes to `founders`, `coCreators` and `carers` by those same ties
  rather than by `owner`, so the client and the rules still state the same
  rule (#1055).
