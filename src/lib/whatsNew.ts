// WHAT'S NEW (issue #1021) - the web mirror.
//
// The record's types and the announcement gate live canonically in
// packages/core/src/whatsNew.ts (which the phone imports). The web app
// deliberately has no @cisa/core dependency, so this is a standalone copy
// (mirroring src/lib/asks.ts). src/lib/whatsNew.test.ts asserts the two
// agree, so the copies cannot drift.
import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  PlatformTarget,
  WhatsNewManifest,
  WhatsNewRelease,
} from '../scripts/compile-whats-new';
import type { WhatsNewSettings } from '../types';


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

export function shouldShowAnnouncement(
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
      return shouldShowAnnouncement(manifest, storage.getItem(), platform);
    },
    markSeen(releaseId: string): void {
      storage.setItem(releaseId);
    },
  };
}

const whatsNewDoc = () => doc(db, 'settings', 'whats_new');

/** Live subscription to the team-wide What's New settings (settings/whats_new). */
export function subscribeWhatsNewSettings(
  cb: (settings: WhatsNewSettings) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    whatsNewDoc(),
    (snap) => {
      const data = typeof snap?.data === 'function' ? (snap.data() as WhatsNewSettings | undefined) : undefined;
      cb(data ?? {});
    },
    (e) => (onError ? onError(e) : console.error("What's New settings subscription error", e)),
  );
}

/** Merge-write the What's New settings (create-or-update). Rules gate it to full-timers. */
export async function saveWhatsNewSettings(
  patch: Partial<WhatsNewSettings>,
  updatedBy?: string | null,
): Promise<void> {
  try {
    await setDoc(
      whatsNewDoc(),
      {
        ...patch,
        updatedAt: serverTimestamp(),
        ...(updatedBy ? { updatedBy } : {}),
      },
      { merge: true },
    );
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'settings/whats_new');
  }
}

export interface WhatsNewSettingsView {
  settings: WhatsNewSettings;
  videoUrl: string;
  videoRoles: string[] | null;
  setVideoUrl: (url: string | null, updatedBy?: string | null) => Promise<void>;
  setVideoSettings: (
    settings: { videoUrl?: string | null; videoRoles?: string[] | null },
    updatedBy?: string | null,
  ) => Promise<void>;
}

/** Hook for accessing and updating What's New settings live. */
export function useWhatsNewSettings(): WhatsNewSettingsView {
  const [settings, setSettings] = useState<WhatsNewSettings>({});

  useEffect(() => {
    return subscribeWhatsNewSettings(setSettings);
  }, []);

  return {
    settings,
    videoUrl: settings.videoUrl || '',
    videoRoles: settings.videoRoles ?? null,
    setVideoUrl: (url, updatedBy) => saveWhatsNewSettings({ videoUrl: url }, updatedBy),
    setVideoSettings: (patch, updatedBy) => saveWhatsNewSettings(patch, updatedBy),
  };
}

