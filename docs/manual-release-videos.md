# Manual Release Videos Workflow

This document explains how to record, host, and attach a **What's New Video** companion to a release.

---

## Overview

A **What's New Video** is a short companion video (typically 30–90 seconds) accompanying an app release.
- **Web App**: The video is embedded directly inside the in-app **What's New Announcement** modal via a responsive YouTube iframe.
- **Mobile App**: A "Watch what's new" button links out to YouTube so users can watch in their native player.
- **Single Source of Truth**: The video link is declared in the release markdown file's frontmatter (`content/whats-new/<date>-v<version>.md`) via the `video_url` property. If omitted, no empty video player or link is shown.

---

## 1. Tooling & Recording Recommendations

Industry standard for crisp release walkthroughs prioritizes human intent, smooth pacing, and clean UI framing:

- **Recommended Tools**:
  - **Screen Studio** (macOS): Automatically applies smooth cursor tracking, intelligent click zooms, motion blur, and professional padding.
  - **Loom** or **QuickTime**: Simple screen recording with microphone voiceover or background audio.
- **Resolution & Aspect Ratio**:
  - Record at **16:9** (e.g. 1920x1080 or 2560x1440).
  - Use high display scaling (100% or 125%) so text and buttons remain clearly legible when embedded.
- **Pacing & Length**:
  - Keep the clip between **30 and 90 seconds**.
  - Show the 2 to 3 key user-facing features introduced in the release (e.g. guest QR code, feedback note editing).
  - Use realistic or clean demo data rather than synthetic E2E fixture strings.

---

## 2. Hosting on YouTube

All release companion videos are hosted on **YouTube** to ensure zero infrastructure overhead, zero bandwidth costs, and multi-device playback:

1. Export the recording as an `.mp4` file.
2. Upload to the official YouTube channel or maintainer account.
3. Set the visibility to **Unlisted** (or **Public** if public release marketing is desired).
   - *Unlisted* ensures anyone with the in-app link can watch it without indexing or channel clutter.
4. Copy the video link (e.g. `https://youtu.be/abc123xyz` or `https://www.youtube.com/watch?v=abc123xyz`).

---

## 3. Attaching to the Release

1. Open the release markdown file:
   ```
   content/whats-new/2026-XX-XX-vX.Y.Z.md
   ```
2. Add or update the `video_url` attribute in the YAML frontmatter:
   ```markdown
   ---
   id: 2026-09-20-v1.7.0
   version: 1.7.0
   title: "Release 1.7.0"
   date: "2026-09-20"
   video_url: "https://youtu.be/abc123xyz"
   platforms:
     - web
     - mobile
   lines:
     - ...
   ---
   ```
3. Recompile the release manifests:
   ```bash
   npm run whats-new:compile
   ```
4. Verify locally:
   - On web, launch `npm run dev` and open the What's New modal from Settings or after clearing `cisa.whats_new.last_seen_id` in localStorage. The YouTube video should render seamlessly in the modal.
