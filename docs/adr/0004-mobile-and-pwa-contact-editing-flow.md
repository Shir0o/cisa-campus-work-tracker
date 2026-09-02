# 0004: Unified mobile and PWA contact editing flow

## Status
Accepted

## Context
In the mobile app v2 design, the person screen (`ContactScreen.tsx`) presented contact details as a read-only disclosure ("Details, notes, how to reach them"), and previous notes documented contact editing as "desktop work". Similarly, on web mobile viewports and PWA layouts, `ContactDetailsModal.tsx` restricted the mobile "Edit" button to administrative staff (`isAdmin`), creating a discrepancy with desktop where field workers (Trainees) could edit contacts.

On-campus outreach and field ministry require field workers to quickly correct typos, update phone numbers/Instagram handles, modify first impression notes, and adjust tags on mobile devices without needing a desktop workstation.

## Decision
1. **Mobile Native Edit Bottom Sheet (`EditContactSheet`)**: Introduce a dedicated bottom sheet on React Native mobile accessible both from the top back row action and directly from within the "Details, notes, how to reach them" disclosure.
2. **Field Scope**: The edit sheet covers core person identity and metadata: Full Name, Phone, Email, Instagram, How we met (`metVia`), Location / Address (`location`), Part of (`role`), First Impression Notes (`notes`), and interactive Tags. Stage / Journey progress remains separated in `MoveStepSheet` to preserve stage workflow clarity.
3. **Unified Write Permissions Across Clients**: Contact editing is authorized for all non-viewer roles (`role !== 'viewer'`), allowing Trainees and Full-timers to edit contacts seamlessly on native mobile, mobile web / PWA viewports, and desktop.
4. **Ergonomics & Data Safety**: Forms incorporate dirty state tracking with an unsaved changes confirmation dialog before dismissal, keyboard avoidance for single-scroll ergonomics, and explicit Save actions with reactive UI updates via shared `@cisa/core` operations.

## Consequences
- Trainees on campus can update contact records directly in the field across mobile native and PWA viewports.
- Gating logic between web mobile viewport and desktop is consolidated, eliminating permission drift.
- Contact stage transitions remain cleanly isolated in `MoveStepSheet`.
