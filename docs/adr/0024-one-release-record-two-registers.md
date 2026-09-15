# 0024. One release record, two registers

Date: 2026-09-14

## Status

Accepted

## Context

Two systems told a reader what changed. `content/whats-new/*.md` (ADR 0008) was
compiled into a static manifest, shown as the What's New modal on web, and
compiled into the store release notes. `packages/core/src/releases.ts` (#546)
was a hand-authored list rendered as a once-per-version, role-targeted sheet on
mobile, held back during the on-campus window. They answered the same question
in two voices.

By the time of this decision they had forked by platform: web showed only the
announcement, mobile only the personal sheet, so each carried a dead half. The
phone's "What's New" tile showed stale `0.1.0` content rather than the current
release, the store listing and the in-app surface were free to disagree, and
only the announcement had a name in the glossary. #831 had already removed the
legacy web sheet; only the phone's copy stayed live.

## Decision

`content/whats-new/*.md` is the single authored record. Each record renders in
two named registers:

- the **What's New Announcement** - the full account, browsable on demand, and
  the source store release notes compile from; and
- the **Release Nudge** - three or four plain sentences, optional `roles`, held
  back while the on-campus window is open, shown once per release.

Web auto-shows only the announcement; mobile auto-shows only the nudge and opens
the announcement on demand. The `RELEASES` list, its gates and its per-platform
mirrors retire. One per-device key, `cisa.whats_new.last_seen_id`, is the only
last-seen memory; the retired `cisa.release.v1` is read once to seed it. A quiet
release (`lines: []`) shows no nudge and never falls back to an older one.

## Consequences

- A release is authored once; the store listing and the in-app surface cannot
  drift apart.
- The retired `releases.ts` prose is not ported - git keeps it.
- The record's `version` is not a second version authority; the tag stays
  authoritative (#1020).
- See [0008](0008-custom-whats-new-announcements.md) for the announcement's
  manifest design and [0020](0020-mobile-release-automation.md) for how the
  store notes ride the release workflow.
