# 0008. Custom What's New Announcements and Release Note Compilation

Date: 2026-09-03

## Status

Accepted

## Context

As new features and bug fixes ship across both the web PWA and mobile apps, users need clear, tailored communication about user-facing updates without being overwhelmed by low-level developer commit jargon.

We evaluated key architectural trade-offs:
1. **Content Storage**: In-repo markdown vs. remote database (Firestore / Remote Config). Because mobile store submissions and web deployments are version-stamped, keeping release notes co-located in the repository ensures version-locking, peer-reviewability, and offline capability without extra database read overhead.
2. **Platform Parity & Targeting**: Features often span both web and mobile, but some changes are platform-specific (e.g., native notifications, ⌘K shortcuts). We need a unified content source where entries can specify target platforms (`platforms: [web, mobile]`).
3. **Changelog Fallback**: While tailor-made summaries are preferred, having to manually create notes from scratch causes friction. We need a fallback tool that converts git commit history into a drafted markdown entry that developers can edit before release.
4. **Runtime Performance**: Parsing raw markdown on mobile devices adds bundle size and runtime CPU overhead. Compiling markdown notes at build-time into static JSON ensures instant rendering and zero parser dependencies on mobile.

## Decision

1. **Markdown Manifests (`content/whats-new/*.md`)**:
   - Each release entry lives in `content/whats-new/<releaseId>.md` (e.g. `2026-09-03-v1.4.0.md`).
   - Frontmatter specifies `id`, `version`, `title`, `date`, and optional `platforms: ['web', 'mobile']`.
   - Markdown body contains clean user-facing highlights with optional platform annotations (e.g. `[Mobile]` or `[Web]`).

2. **Drafting CLI (`npm run whats-new:draft`)**:
   - A helper script reads git commits since the previous release tag or latest markdown file.
   - Categorizes commits (`feat`, `fix`) and generates a structured starter markdown file in `content/whats-new/` ready for human tailoring.

3. **Build-Time Compilation (`scripts/compile-whats-new.ts`)**:
   - Compiles all `content/whats-new/*.md` files into a lightweight, sorted JSON manifest (`whats-new.json`).
   - Distributes the manifest to both web (`src/generated/whats-new.json`) and mobile (`apps/mobile/assets/whats-new.json`).
   - If a release has no tailor-made file, the compiler falls back to generating a sanitized entry from recent git commits or emits a validation warning.

4. **Trigger & Presentation Flow**:
   - **Auto-popup**: Upon app launch/authentication, the app compares the latest relevant release ID against `lastSeenWhatsNewId` in local device storage (`localStorage` on web, `AsyncStorage` on mobile).
   - If newer, the "What's New" modal opens once and stores the dismissed release ID upon close.
   - **Settings Access**: A "What's New" option in Settings / About view allows users to revisit past release notes on demand.

## Consequences

- **Pros**:
  - Offline-friendly, zero database read costs.
  - Zero heavy markdown runtime dependencies on React Native / mobile.
  - Releases remain version-locked and auditable in git history.
  - Rapid drafting via CLI while empowering human tailoring of announcements.
- **Cons**:
  - Release notes cannot be updated out-of-band for a past version without a new deployment.
