# 0039. Standard tags are one Full-timer-edited list

Date: 2026-10-06

## Status

Accepted. Replaces the fixed `TAG_SUGGESTIONS` anchor list in ADR 0036.

## Context

`TAG_SUGGESTIONS` (`Saved`, `Baptized`, `Interested`, `Open`, `Club Rush`, `BFA`) was a constant in code serving two jobs: the suggestion chips when tagging a contact (web and mobile), and the anchors that combine tags folds variants toward. Any new outreach tag needed a code change before combine tags would prefer it, and the six anchors made the guesses feel limited.

## Decision

Standard tags are a single list stored in Firestore and edited by Full-timers from the Combine tags page ("Make standard", reorder, remove). The same list drives both the suggestion chips and the combine targets. Season tags (`Spring/Summer/Fall/Winter YYYY`) remain standard automatically. Removing a standard tag never removes it from contacts. The list is seeded with the six former constants.

## Considered Options

- **Separate lists for chips and anchors**: rejected. The two would drift, and cleanup would pull toward names that field workers are never offered.
- **Anchors derived from usage (any tag on N+ contacts)**: rejected. The most popular spelling is often the wrong one (`bfa table` outnumbering `BFA`).
- **Keep a code constant and edit it now**: rejected. Every new outreach would need a deploy.
