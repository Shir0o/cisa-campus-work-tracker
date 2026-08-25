// WHAT CHANGED SINCE YOU LAST OPENED THIS (#546) — mobile store.
//
// The pure gate + authored notes live in @cisa/core (packages/core/src/releases.ts);
// this file is only the phone's storage half: AsyncStorage instead of the web
// mirror's localStorage, using the SAME `cisa.release.v1` key so a person who
// signs in on both keeps one last-seen memory per device.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RELEASE_LS_KEY,
  RELEASES,
  releaseShow,
  type AppRole,
  type Release,
} from '@cisa/core';

type Listener = () => void;

const subs = new Set<Listener>();
let seen: string | null = null;

const seed = (): string | null => {
  // A machine with no record has never been updated, so upstream would stamp
  // the version it just installed and say nothing. Here — the same traceSeed
  // trick as the web mirror — a fresh install is stamped one release back so
  // the newest release reads once on a clean slate instead of being invisible.
  const prev = RELEASES[1];
  return prev ? prev.version : null;
};

/** Reads the store (async), seeding a fresh machine. Call once at app boot —
 *  idempotent, so re-reading after a launch keeps whatever was last stored. */
export async function initReleaseStore(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RELEASE_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.version === 'string') {
        seen = parsed.version;
        return;
      }
    }
  } catch {
    // Fall through to the seed — a broken record is the same as none.
  }
  seen = seed();
  try {
    if (seen) {
      await AsyncStorage.setItem(
        RELEASE_LS_KEY,
        JSON.stringify({ version: seen, at: new Date().toISOString() }),
      );
    }
  } catch {
    // Non-fatal — the sheet simply shows this visit.
  }
}

export function seenVersion(): string | null {
  return seen;
}

export async function markReleaseSeen(version: string): Promise<void> {
  seen = version;
  try {
    await AsyncStorage.setItem(
      RELEASE_LS_KEY,
      JSON.stringify({ version, at: new Date().toISOString() }),
    );
  } catch {
    // Non-fatal — the sheet simply shows again next launch.
  }
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener shouldn't stop the others */
    }
  });
}

export function subscribeReleases(fn: Listener): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/** Live gate for a component: re-renders when the seen version changes. */
export function useRelease(role: AppRole | null | undefined, inWindow = false): Release | null {
  const [, force] = useState(0);
  useEffect(() => subscribeReleases(() => force((n) => n + 1)), []);
  return releaseShow(role, inWindow, seen);
}