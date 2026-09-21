# 0030. What's New Video companion and manual recording workflow

Date: 2026-09-21

## Status

Accepted

## Context

Issue #1123 and #1151 introduced the **What's New Video** companion — a short video accompanying app releases to demonstrate new features and UX improvements.

A key question during the initiative was whether release videos should be **fully automated** (Option B: scripted via headless Playwright E2E tests capturing `.webm` videos during CI runs) or **manual/curated** (Option A: recorded by product engineers using dedicated screencasting tools like Screen Studio or Loom).

A spike was implemented (`e2e/whats-new-video-spike.spec.ts`) and executed in CI (GitHub Actions run `35561760134`), emitting an automated 7-second capture. Evaluation revealed significant flaws inherent to headless automation for end-user product walkthroughs:
1. **Robotic pacing**: Playwright transitions instantaneously between elements or blocks silently during network fetches, creating disorienting visual jumps.
2. **Synthetic test fixtures**: The emulator database contains synthetic E2E names (e.g. `E2E Quick 1789966017299`) and bare test records rather than authentic product narratives.
3. **Absence of cursor focus**: Pure browser frame recording lacks cursor smoothing, click zooms, and visual callouts needed for viewers to follow interface changes.
4. **Lack of narration and context**: Features require intentional voice or caption framing to explain the value of what changed.

We also evaluated video hosting options:
- **Cloudflare R2 / Custom Object Storage**: Required deploying custom video streaming players, managing credentials, and handling custom video transcoding.
- **YouTube (Unlisted)**: Zero hosting or bandwidth costs, automatic multi-resolution transcoding across devices, embeds natively via `iframe` on web, and opens natively on mobile.

## Decision

1. **Retire Automated Headless Screen Capture**:
   - Automated video generation via Playwright in CI is retired.
   - The test spec `e2e/whats-new-video-spike.spec.ts` is retained strictly as a regression test without `video: 'on'`.
   - The artifact upload step in `.github/workflows/e2e.yml` is removed to save runner minutes and storage quota.

2. **Adopt Manual, High-Quality Screencasting**:
   - Maintainers spend 2–3 minutes recording an intentional 30–90 second clip using modern tools (Screen Studio, Loom, QuickTime) when significant features ship.
   - Guidelines and tooling recommendations are documented in `docs/manual-release-videos.md`.

3. **Host on YouTube as Unlisted**:
   - Release videos are hosted as Unlisted videos on YouTube.
   - The web app embeds the YouTube iframe directly inside the What's New Announcement modal via `WhatsNewModal`.
   - The mobile app renders a "Watch what's new" link that opens YouTube via `Linking`.

4. **One Authored Release Record (ADR 0024)**:
   - The YouTube URL is stored in the `video_url` frontmatter property of `content/whats-new/<date>-v<version>.md`.
   - When present, the player/link is shown; when absent, no empty player is displayed.

5. **Tag Workflow Integration**:
   - `.github/workflows/draft-whats-new.yml` opens a pull request on new release tags rather than pushing directly to `main`, providing maintainers with an explicit review checkpoint to curate notes and attach `video_url`.

## Consequences

- High-quality, polished video walkthroughs with cursor smoothing and context instead of robotic CI captures.
- Zero extra infrastructure costs or video transcoding dependencies.
- No wasted CI runner time or artifact storage overhead.
- Release videos remain optional and non-blocking: a release without a video simply shows the text announcement without layout shift or dead players.

## References

- Origin issue: [#1123](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1123), [#1151](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1151)
- Implementation PR: [#1153](https://github.com/Shir0o/cisa-campus-work-tracker/pull/1153)
- Maintainer guide: [`docs/manual-release-videos.md`](../manual-release-videos.md)
- Prior ADRs: [ADR 0008](0008-custom-whats-new-announcements.md), [ADR 0024](0024-one-release-record-two-registers.md)
