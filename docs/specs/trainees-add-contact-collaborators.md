## Problem Statement

When campus ministers and trainees work together on campus, they form partnerships and share pastoral responsibility for contacts. However, three key obstacles currently hinder effective collaboration:

1. **Co-Creators Cannot Manage Collaborators**: In the current system, only the designated pastoral caregiver (`owner`) or a Full-timer Admin can add or remove people from a contact's `coCreators` list. Co-creators (such as gospel partners who go out together and co-own the work) cannot loop in additional teammates or manage collaborator access.
2. **Missing Mobile Collaborator Interface**: On native mobile (`ContactScreen`), there is no UI to view or manage who else can see a contact. Sharing can only be configured from desktop web.
3. **Impersonation Privilege Leak ("See it as their view")**: When Full-timers preview the app using "See it as their view", the client simulates a non-admin persona (e.g. Trainee), but backend Firestore requests carry the Admin's authentic credentials (`request.auth.uid`). Firestore rules evaluate `isAdmin()` as true, allowing mutations that actual non-admin users cannot perform and obscuring true authorization boundaries.

## Solution

1. **Enable Co-Creator Privileges**: Grant members listed in `coCreators` the authority to add and remove teammates from `coCreators` on both web and mobile, while keeping the primary caregiver assignment (`owner`) strictly restricted to the owner and Admins. Ensure the original creator (`createdBy`/`addedBy`) cannot be removed.
2. **Mobile Collaborator Management**: Add a dedicated "Who else can see" section to mobile `ContactScreen`, mirroring the web application model with current collaborator avatars/roles, an "+ Add someone" roster picker, and remove controls for users with sharing rights.
3. **Enforce Read-Only Impersonation**: Define "See it as their view" as a strictly read-only preview tool. Disable or gate write/mutate operations across web and mobile while impersonation is active, visually communicating `(read-only preview)` and eliminating the privilege bypass.

## User Stories

1. As a Trainee who co-owns a contact as a co-creator, I want to add another teammate to the contact's collaborators on web, so that our partner can see and follow up with the student.
2. As a Trainee who co-owns a contact as a co-creator, I want to add another teammate to the contact's collaborators on mobile, so that I can loop in partners while doing ministry in the field.
3. As a co-creator, I want to remove a collaborator from the contact when their involvement concludes, so that the collaborator list remains accurate.
4. As a contact creator, I want other co-creators to be prevented from removing me from the contact, so that my access is never lost.
5. As a contact owner, I want only myself and Full-timer admins to be able to transfer the primary pastoral owner, so that pastoral accountability cannot be accidentally reassigned by collaborators.
6. As a Full-timer admin auditing views using "See it as their view", I want mutating actions to be disabled with a read-only preview indicator, so that I do not accidentally modify data with admin privileges under a simulated identity.
7. As a mobile user viewing a contact, I want to see a "Who else can see" card displaying all collaborators and their roles, so that I know who shares visibility into this person.
8. As a developer, I want Firestore security rules to distinguish between `owner` updates and `coCreators` updates, so that co-creators are authorized to update collaborators at the database layer while owner transfers remain protected.
9. As a developer, I want the core authorization helpers to expose clean predicates for collaborator management and ownership transfer, so that web and mobile apps enforce identical logic.

## Implementation Decisions

- **Firestore Security Rules**:
  - Split contact update permissions into two distinct blocks for metadata changes vs ownership/sharing changes:
    - If `owner` is modified: Require `isAdmin() || existing().get('owner', null) == request.auth.uid || (existing().get('owner', null) == null && (existing().get('createdBy', null) == request.auth.uid || existing().get('addedBy', null) == request.auth.uid))`.
    - If only `coCreators` is modified: Permit if `isAdmin() || existing().get('owner', null) == request.auth.uid || request.auth.uid in existing().get('coCreators', [])`.
- **Core Authorization Helpers (`@cisa/core`)**:
  - Introduce `canManageCollaborators(role, uid, contact)`: Returns true if `role === 'admin' || contact.owner === uid || contact.createdBy === uid || (contact.coCreators || []).includes(uid)`.
  - Introduce `canTransferOwnership(role, uid, contact)`: Returns true if `role === 'admin' || contact.owner === uid || contact.createdBy === uid`.
- **Web App (`ContactDetailsModal`)**:
  - Update `canShare` to use `canManageCollaborators` and disallow write operations when impersonating (`!isImpersonating`).
  - Prevent removing the original creator from `coCreators`.
- **Mobile App (`ContactScreen` & `AuthProvider`)**:
  - Expose `isImpersonating` in AuthProvider.
  - Implement a dedicated "Who else can see" section in `ContactScreen` with an add collaborator bottom sheet picker and remove controls.
  - Add `addContactCollaborator` and `removeContactCollaborator` data helper functions in `apps/mobile/src/lib/data/contacts.ts`.
  - Disable editing and creation triggers when `isImpersonating` is true.

## Testing Decisions

- **External Behavior Verification**:
  - Test Firestore security rules using `@firebase/rules-unit-testing` against the Firestore emulator:
    - Non-owner co-creator successfully adds and removes members from `coCreators`.
    - Non-owner co-creator fails when attempting to change `owner`.
    - Non-co-creator non-owner fails when attempting to mutate `coCreators`.
  - Test Web UI via React Testing Library in `ContactDetailsModal.test.tsx`:
    - Co-creator sees the share controls and can trigger collaborator addition/removal.
    - Creator cannot be removed.
    - Impersonation mode disables sharing controls.
  - Test Mobile UI via React Native Testing Library in `ContactScreen.test.tsx`:
    - Renders collaborators and respects `canShare` / `isImpersonating`.
- **Prior Art**:
  - Existing emulator test suite in `src/test/firestore.rules.test.ts`.
  - Component tests in `src/test/ContactDetailsModal.test.tsx` and `apps/mobile/src/components/contact/ContactScreen.test.tsx`.

## Out of Scope

- Minting custom Firebase Auth tokens on a backend server for impersonation.
- Rewriting historical audit logs for contact transfers.
- Adding collaborator management to student or community guest views.

## Further Notes

- Documented in ADR 0022 and updated in `CONTEXT.md`.
