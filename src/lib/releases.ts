// WHAT CHANGED SINCE YOU LAST OPENED THIS (#546) — web mirror.
//
// The web app deliberately has no @cisa/core dependency, so this is a
// standalone copy of the shared logic in packages/core/src/releases.ts (same
// convention as goal.ts / asks.ts). The authored notes and the ONE gate live
// there; only the store's storage differs (localStorage here, AsyncStorage in
// the mobile mirror). The `cisa.release.v1` key is the shared contract.
import { useEffect, useState } from 'react';
import type { AppRole } from './permissions';

export interface Release {
  version: string;
  date: string;
  roles?: AppRole[];
  lines: string[];
}

export const RELEASE_LS_KEY = 'cisa.release.v1';

// Newest first — mirrors packages/core/src/releases.ts.
export const RELEASES: Release[] = [
  {
    version: '0.1.0',
    date: '2026-08-25',
    roles: ['admin', 'manager', 'operator', 'viewer'],
    lines: [
      'Ask the team: a question that isn\u2019t about a person now has a home, and the answer comes back to whoever asked.',
      'There is no \u201cyour full-timer\u201d any more \u2014 every full-timer stands over every trainee, and questions go to the whole team.',
      'Pray together walks the people on your heart one at a time, and the prayer list sorts by who has gone quiet.',
      'On an on-campus day, the strip above the queue fills quietly as people are added \u2014 one shared goal the whole team meets.',
    ],
  },
  { version: '0.0.1', date: '2026-08-12', lines: [] },
];

export function releaseFor(role: AppRole | null | undefined): Release | null {
  return (
    RELEASES.find(
      (r) => r.lines.length > 0 && (!r.roles || r.roles.includes(role as AppRole)),
    ) ?? null
  );
}

export function releaseUnseen(
  role: AppRole | null | undefined,
  seenVersion: string | null,
): Release | null {
  const r = releaseFor(role);
  return r && r.version !== seenVersion ? r : null;
}

/** THE ONE GATE: a release worth a person's morning, unseen, and not inside
 *  the on-campus window. The window is a phone fact, so the web passes false —
 *  the desktop never has one. */
export function releaseShow(
  role: AppRole | null | undefined,
  inWindow: boolean,
  seenVersion: string | null,
): Release | null {
  return inWindow ? null : releaseUnseen(role, seenVersion);
}

export function releaseDateWords(iso: string): string {
  try {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

// ── Store ──────────────────────────────────────────────────────────────────
// The last-seen version is the ONLY thing stored. A machine with no record has
// never been updated, so it's stamped one release back and told nothing —
// but a fresh browser SHOULD read the newest release once on a clean slate,
// so the fallback stamp is RELEASES[1] (the same traceSeed trick as mobile).
type Listener = () => void;

const subs = new Set<Listener>();
let seen: string | null = null;
let hydrated = false;

const read = (): string | null => {
  try {
    const raw = localStorage.getItem(RELEASE_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.version === 'string') return parsed.version;
    }
  } catch {
    // Fall through to the seed below — a broken record is the same as none.
  }
  return null;
};

const seed = (): string | null => {
  const prev = RELEASES[1];
  const v = prev ? prev.version : null;
  if (v) {
    try {
      localStorage.setItem(RELEASE_LS_KEY, JSON.stringify({ version: v, at: new Date().toISOString() }));
    } catch {
      // Non-fatal — the sheet simply shows on this visit.
    }
  }
  return v;
};

export function seenVersion(): string | null {
  if (!hydrated) {
    seen = read() ?? seed();
    hydrated = true;
  }
  return seen;
}

export function markReleaseSeen(version: string): void {
  seen = version;
  try {
    localStorage.setItem(RELEASE_LS_KEY, JSON.stringify({ version, at: new Date().toISOString() }));
  } catch {
    // Non-fatal — the sheet simply shows again next visit.
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
export function useRelease(
  role: AppRole | null | undefined,
  inWindow = false,
): Release | null {
  const [, force] = useState(0);
  useEffect(() => subscribeReleases(() => force((n) => n + 1)), []);
  return releaseShow(role, inWindow, seenVersion());
}