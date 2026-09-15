// THE RELEASE NUDGE, phone store (issue #1021).
//
// The record and the pure gates live in @cisa/core
// (packages/core/src/whatsNew.ts); this file is only the phone's storage half.
// One per-device "last seen release" id under `cisa.whats_new.last_seen_id`,
// the same key the web announcement writes. A device carrying the retired
// `cisa.release.v1` key is seeded from it once, so upgrading never re-shows a
// release the reader has already dealt with.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWhatsNewForPlatform,
  latestRelease,
  releaseShow,
  SEEN_RELEASE_STORAGE_KEY,
  type AppRole,
  type PlatformTarget,
  type WhatsNewManifest,
  type WhatsNewRelease,
} from '@cisa/core';
import manifestJson from '../../assets/whats-new.json';

export const SEEN_RELEASE_KEY = SEEN_RELEASE_STORAGE_KEY;
const LEGACY_SEEN_KEY = 'cisa.release.v1';

const manifest = manifestJson as unknown as WhatsNewManifest;

type Listener = () => void;

const subs = new Set<Listener>();
let seen: string | null = null;

/** The retired key stored `{ version, at }`; accept a raw id too. */
function readLegacy(raw: string | null): string | null {
  if (raw === null || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.version === 'string') return parsed.version;
  } catch {
    // Not JSON - fall through and treat it as a raw id.
  }
  return raw;
}

/** Reads the store (async), seeding from the retired key. Call once at boot. */
export async function initReleaseStore(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_RELEASE_KEY);
    if (raw === null || raw.length === 0) {
      const legacy = readLegacy(await AsyncStorage.getItem(LEGACY_SEEN_KEY));
      if (legacy) {
        seen = legacy;
        await AsyncStorage.setItem(SEEN_RELEASE_KEY, legacy);
        return;
      }
    } else {
      seen = raw;
      return;
    }
  } catch {
    // A broken record is the same as none.
  }
  seen = null;
}

export function seenReleaseId(): string | null {
  return seen;
}

export async function markReleaseSeen(id: string): Promise<void> {
  seen = id;
  try {
    await AsyncStorage.setItem(SEEN_RELEASE_KEY, id);
  } catch {
    // Non-fatal - the nudge simply shows again next launch.
  }
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener should not stop the others */
    }
  });
}

export function subscribeReleases(fn: Listener): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** Live auto-gate for the nudge sheet: re-renders when the seen id changes. */
export function useReleaseNudge(
  role: AppRole | null | undefined,
  inWindow = false,
): WhatsNewRelease | null {
  const [, force] = useState(0);
  useEffect(() => subscribeReleases(() => force((n) => n + 1)), []);
  return releaseShow(manifest, role, inWindow, seen);
}

/** The full announcement record, for the on-demand "What's New" surface. */
export function latestAnnouncement(platform: PlatformTarget = 'mobile'): WhatsNewRelease | null {
  const latest = latestRelease(manifest);
  return latest === null ? null : getWhatsNewForPlatform(latest, platform);
}
