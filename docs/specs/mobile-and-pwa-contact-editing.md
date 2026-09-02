# Spec: Unified Mobile and Web PWA Contact Editing Flow

## Problem Statement

When full-time campus ministers and trainees are engaged in on-campus field outreach, they frequently need to correct contact typos, add new phone numbers or Instagram handles, update first impression notes, and assign or modify descriptive tags on the fly. 

Currently, on the mobile app, the person screen displays contact details in a read-only disclosure and lacks any affordance to edit the person's profile information. On the web app, when accessed via mobile viewports or as an installed PWA, the "Edit" action is restricted solely to administrative staff (`isAdmin`), preventing Trainees in the field from updating contact profiles on their mobile devices without resorting to a full desktop screen.

## Solution

Provide a seamless, native contact editing workflow across mobile devices and progressive web app (PWA) viewports:

1. **Native Mobile App (`EditContactSheet`)**:
   - Provide clear, accessible entry points from both the top header row and within the "Details, notes, how to reach them" disclosure on the person screen.
   - Present a keyboard-friendly bottom sheet containing all core profile fields: Full Name, Phone, Email, Instagram, How We Met (`metVia`), Location/Address (`location`), Part of / Affiliation (`role`), First Impression Notes (`notes`), and interactive Tags.
   - Support interactive tag management with quick-toggle suggestions and custom tag entry.
   - Include unsaved changes protection (discard confirmation dialog) and visual toast feedback on save.

2. **Web Mobile Viewport / PWA Parity**:
   - Align write permissions on the responsive web contact modal so all authorized write roles (Trainees and Full-timers) have access to the mobile edit action.
   - Maintain the mobile full-screen edit header and scrolling form with complete field and tag editing parity.

## User Stories

1. As a Trainee on campus, I want to tap an "Edit" action on a person's profile screen on mobile, so that I can immediately update their contact information after a conversation.
2. As a Trainee reviewing the "Details, notes, how to reach them" disclosure on mobile, I want an inline "Edit details" button, so that I can edit info directly from the section where I am reading it.
3. As a Full-timer, I want to edit a person's name on mobile, so that typos made during rapid quick capture can be corrected right away.
4. As a Gospel Partner, I want to add or update a student's phone number on mobile, so that my partner and I have the correct phone number for text and call follow-ups.
5. As a Trainee, I want to add or update a person's Instagram handle and email address on mobile, so that social media and email outreach channels stay accurate.
6. As a Full-timer, I want to edit how we met (`metVia`) and meeting location or address on mobile, so that context about our initial encounter is preserved.
7. As a Trainee, I want to edit the person's affiliation or campus group ("Part of") on mobile, so that contacts are categorized correctly for group activities.
8. As a Gospel Partner, I want to update first impression notes on mobile, so that newly learned pastoral background is documented for our team.
9. As a Trainee, I want to tap suggested tag chips to add or remove tags on mobile, so that tagging requires minimal typing on a touchscreen.
10. As a Full-timer, I want to type and add a custom tag on mobile, so that new descriptive tags can be attached on the fly.
11. As a Trainee who accidentally modified a field and taps cancel, I want to be prompted with a confirmation dialog before changes are discarded, so that I don't lose typed notes by accident.
12. As a Full-timer who closes the sheet without making changes, I want the sheet to close immediately without unnecessary confirmation prompts, so that navigating is fast.
13. As a Trainee who saves contact updates on mobile, I want to see a confirmation toast ("Contact details updated"), so that I have clear feedback that my changes were saved.
14. As a Trainee accessing the web app on a mobile browser or installed PWA, I want the "Edit" button to appear in the header, so that I have full editing capability without needing a desktop browser.
15. As a Viewer role user, I want edit affordances on mobile and PWA to remain hidden, so that read-only permission boundaries are strictly respected.
16. As a Trainee editing a contact, I want Stage changes to remain separate in the dedicated Move Step sheet, so that pipeline progression workflows remain distinct and deliberate.

## Implementation Decisions

- **Entry Point Integration**: The mobile person screen provides two distinct entry points for editing: a secondary action button in the top back bar row (`Edit`), and an explicit interactive row inside the expanded details disclosure (`Edit details`).
- **Sheet-Based Modal Flow**: On React Native mobile, the edit flow operates as a bottom sheet modal wrapping a keyboard-avoiding scroll container with interactive text inputs and chip selectors.
- **Unified Role Permissions**: Write permission is standardized across desktop web, PWA/mobile viewport, and React Native mobile to all non-viewer roles (`role !== 'viewer'`).
- **Tag Management Interaction**: Tag selection uses interactive chip toggling for common suggestions plus an inline text field with an add action for custom tag creation.
- **Data Mutation & Reactivity**: Form saves dispatch atomic updates via the shared data layer (`updateContact` and `updateContactTags`), with real-time subscriptions immediately updating the active profile view.
- **Dirty State Guard**: The edit sheet tracks dirty form state against initial contact values. Dismissal attempts when dirty trigger a native alert dialog confirming whether to discard changes.
- **Decoupled Stage Progression**: Contact lifecycle stage transitions remain exclusively within the existing stage move sheet, keeping profile editing focused on identity, contact channels, and metadata.

## Testing Decisions

- **High-Level UI Component Seams**:
  - Test the mobile person screen by rendering the screen component, tapping the Edit action, modifying form fields and tags in the edit sheet, tapping Save, and asserting that the core data update utilities are called with the expected patch and the success toast appears.
  - Test dirty form dismissal by modifying a field, attempting dismissal, and verifying that the discard confirmation alert is displayed.
  - Test permission gating by verifying that viewer roles do not render edit affordances.
  - Test web mobile viewport / PWA by rendering the web contact modal with a mobile media query as a Trainee manager role, asserting that the Edit button is rendered and interactive.
- **Prior Art**:
  - Mobile tests in `apps/mobile/src/components/contact/ContactScreen.test.tsx` and `apps/mobile/src/components/journey/MoveStepSheet.test.tsx`.
  - Web modal tests in `src/test/ContactDetailsModal.test.tsx`.

## Out of Scope

- Merging Stage / Journey pipeline progression into the profile edit sheet (handled via `MoveStepSheet`).
- Modifying Gospel Partner pair assignment or reassigning contact creator ownership (managed via Settings / administrative tools).
- Deleting contacts from the mobile app (remains a desktop administrative function).

## Further Notes

- Respects ADR 0004 (`0004-mobile-and-pwa-contact-editing-flow.md`) and domain glossary terms in `CONTEXT.md`.
