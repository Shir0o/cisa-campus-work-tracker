# 0034. Google Drive Video Hosting for Release Companions

Date: 2026-09-30

## Status

Accepted (supersedes the YouTube hosting decision in [ADR 0030](0030-whats-new-video-companion.md))

## Context

[ADR 0030](0030-whats-new-video-companion.md) established the What's New Video companion workflow and selected YouTube (Unlisted) as the hosting medium.

However, feature video walkthroughs contain internal campus team data, workflows, and ministry communications intended specifically for internal campus ministers, full-timers, and trainees. Hosting these clips on public third-party video networks (even if unlisted) raises privacy considerations and subjects viewers to third-party ad tracking, cookie banners, and algorithmic video suggestions.

Google Drive is the ministry's existing storage infrastructure, allowing access restrictions tied to organizational Google Workspace accounts.

## Decision

1. **Host What's New Videos on Google Drive**:
   - Companion video recordings are uploaded to the team's Google Drive.
   - Sharing permissions are restricted internally to team members/organization accounts.
2. **In-App Embed via Drive Preview**:
   - Web embeds Google Drive videos using `https://drive.google.com/file/d/<fileId>/preview`.
   - Both `/file/d/<id>` and `/open?id=<id>` URL patterns are parsed automatically.
3. **Direct Open Fallback**:
   - Because third-party cookie restrictions or cross-origin Google account switching can sometimes obstruct Google Drive iframe rendering, `WhatsNewModal` renders a direct helper link (*"Open video in Google Drive"*) beneath the player.
4. **Mobile Native Handling**:
   - Mobile continues to link out to the `video_url` directly via system linking, opening in the Google Drive app or native browser.

## Consequences

- Release videos remain secure and access-restricted within the internal organization domain.
- Eliminates third-party cookie banners and video recommendation bleed from YouTube.
- Simple workflow: maintainers drop the video into Google Drive, copy the share link, and add it to `content/whats-new/<date>-v<version>.md`.
