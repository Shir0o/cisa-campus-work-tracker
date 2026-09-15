// RELEASE COMMUNICATION (issue #1021).
//
// One authored record - content/whats-new/*.md - renders in two named
// registers:
//   - the WHAT'S NEW ANNOUNCEMENT: the full account of a release, browsable on
//     demand and the source the store release notes compile from.
//   - the RELEASE NUDGE: the once-per-version "what is different for you",
//     role-targeted and held back while the on-campus window is open.
//
// This is the platform-agnostic half: the record's types and the two pure
// gates over the compiled manifest. The web app has no @cisa/core dependency
// (mirroring src/lib/asks.ts), so its standalone copy lives in src/lib/whatsNew.ts.
import type { AppRole } from './permissions';

/** One per-device "last seen release" id, shared by web and phone. */
export const SEEN_RELEASE_STORAGE_KEY = 'cisa.whats_new.last_seen_id';

export type PlatformTarget = 'web' | 'mobile';
export type WhatsNewCategory = 'feature' | 'ui' | 'fix';

export interface WhatsNewItem {
  text: string;
  platforms: PlatformTarget[];
  category?: WhatsNewCategory;
}

export interface WhatsNewRelease {
  id: string;
  version: string;
  title: string;
  date: string;
  platforms: PlatformTarget[];
  /** Roles the Release Nudge speaks to. Omit for everyone; [] reaches nobody. */
  roles?: AppRole[];
  /** The Release Nudge's 3-4 plain sentences. Empty or absent = quiet release. */
  lines?: string[];
  overview?: string;
  items: WhatsNewItem[];
}

export interface WhatsNewManifest {
  latestReleaseId: string | null;
  releases: WhatsNewRelease[];
}

/** The announcement's newest release, or null when the manifest is empty. */
export function latestRelease(manifest: WhatsNewManifest): WhatsNewRelease | null {
  if (manifest.latestReleaseId === null) return null;
  return manifest.releases.find((r) => r.id === manifest.latestReleaseId) ?? null;
}

/** The release as this platform sees it: drop other platforms' items. */
export function getWhatsNewForPlatform(
  release: WhatsNewRelease,
  platform: PlatformTarget,
): WhatsNewRelease | null {
  if (release.platforms.includes(platform) === false) return null;
  return {
    ...release,
    items: release.items.filter((item) => item.platforms.includes(platform)),
  };
}

/** The What's New Announcement: latest release, for this platform, unseen. */
export function shouldShowAnnouncement(
  manifest: WhatsNewManifest,
  lastSeenId: string | null,
  platform: PlatformTarget,
): boolean {
  const latest = latestRelease(manifest);
  if (latest === null) return false;
  if (getWhatsNewForPlatform(latest, platform) === null) return false;
  if (lastSeenId === null || lastSeenId === '') return true;
  return latest.id > lastSeenId;
}

/** The lines a release actually nudges with (trimmed, blanks dropped). */
export function releaseLines(release: WhatsNewRelease): string[] {
  return (release.lines ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
}

/** The Release Nudge for a role, unseen. The LATEST record only: a quiet
 *  release shows nothing and never falls back to an older one. */
export function nudgeFor(
  manifest: WhatsNewManifest,
  role: AppRole | null | undefined,
  seenId: string | null,
): WhatsNewRelease | null {
  const latest = latestRelease(manifest);
  if (latest === null) return null;
  if (releaseLines(latest).length === 0) return null;
  if (latest.roles && latest.roles.includes(role as AppRole) === false) return null;
  if (latest.id === seenId) return null;
  return latest;
}

/** THE ONE GATE: a nudge worth a person's morning, unseen, and not inside the
 *  on-campus window. The window is a phone fact; the web passes false. */
export function releaseShow(
  manifest: WhatsNewManifest,
  role: AppRole | null | undefined,
  inWindow: boolean,
  seenId: string | null,
): WhatsNewRelease | null {
  return inWindow ? null : nudgeFor(manifest, role, seenId);
}

/** "25 August" - a date-only string does not slip a day backwards west of UTC. */
export function releaseDateWords(iso: string): string {
  try {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}
