import type {
  PlatformTarget,
  WhatsNewItem,
  WhatsNewManifest,
  WhatsNewRelease,
} from '../scripts/compile-whats-new';

export const WHATS_NEW_STORAGE_KEY = 'cisa.whats_new.last_seen_id';

export interface StorageAdapter {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
}

export function getWhatsNewForPlatform(
  release: WhatsNewRelease,
  platform: PlatformTarget
): WhatsNewRelease | null {
  if (!release.platforms.includes(platform)) {
    return null;
  }

  const filteredItems = release.items.filter((item) =>
    item.platforms.includes(platform)
  );

  return {
    ...release,
    items: filteredItems,
  };
}

export function shouldShowWhatsNew(
  manifest: WhatsNewManifest,
  lastSeenId: string | null,
  platform: PlatformTarget
): boolean {
  if (!manifest.latestReleaseId) return false;

  const latest = manifest.releases.find((r) => r.id === manifest.latestReleaseId);
  if (!latest) return false;

  const platformRelease = getWhatsNewForPlatform(latest, platform);
  if (!platformRelease) return false;

  if (!lastSeenId) return true;

  // Comparison: If manifest's latestReleaseId is greater than lastSeenId
  return manifest.latestReleaseId > lastSeenId;
}

export function markWhatsNewSeen(
  storage: StorageAdapter,
  releaseId: string
): void | Promise<void> {
  return storage.setItem(WHATS_NEW_STORAGE_KEY, releaseId);
}

export function createWhatsNewState(
  storage: { getItem: () => string | null; setItem: (val: string) => void },
  platform: PlatformTarget
) {
  return {
    getLastSeenId(): string | null {
      return storage.getItem();
    },
    shouldShow(manifest: WhatsNewManifest): boolean {
      return shouldShowWhatsNew(manifest, storage.getItem(), platform);
    },
    markSeen(releaseId: string): void {
      storage.setItem(releaseId);
    },
  };
}
