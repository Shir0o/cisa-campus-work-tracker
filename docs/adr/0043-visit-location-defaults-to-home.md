# 0043: Visit location defaults to Home, retiring manual entry for households

## Status
Accepted

## Context
When logging a visit in `LogVisitModal`, the form previously presented a prominent "Where" text input alongside the date. While `where` auto-filled from the matched `Home.place` (per ADR 0031), presenting an active text field placed an unnecessary data-entry burden on users when the vast majority of visits occur at the family's home. Furthermore, when visits were saved without an explicit address, `VisitCard` displayed a sterile `"No address noted"` fallback label.

## Decision

1. **Passive location for single-home visits**:
   When the chosen contacts map to an unambiguous `Home`:
   - Hide the active `Where` input by default.
   - Present a quiet, inline preview: `At {Home.label}'s home` (including `({Home.place})` if an address exists) with a `Change location` button.
   - Clicking `Change location` reveals the text input for exceptional visits (e.g., meeting a family at a restaurant or park), with a `Use home address` affordance to revert.

2. **Visible optional input for unlinked / mixed visits**:
   When contacts do not belong to a single `Home` (or belong to multiple households), display the standard optional `Where` input field, as no home location can be safely inferred.

3. **Snapshot on save**:
   Continue storing `where` on the Firestore `Visit` document so history remains intact even if a household moves later (ADR 0031). If unchanged by the user, it stores `Home.place` or empty string.

4. **Warm display fallback**:
   On `VisitCard` and activity feed logs:
   - Retire the `"No address noted"` label.
   - If `visit.where` is empty, fall back to `"{Home.label}'s home"` (if linked to a `Home`), or `"Home visit"` if unlinked.

## Consequences
- The common 90%+ path of logging a visit requires zero typing or review for location.
- Historical address records remain preserved on each visit document.
- Card presentation reads naturally and warmly rather than highlighting missing metadata.
