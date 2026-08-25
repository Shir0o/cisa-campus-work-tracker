import { describe, expect, it, beforeEach } from 'vitest';
import {
  RELEASES,
  releaseDateWords,
  releaseFor,
  releaseShow,
  releaseUnseen,
  seenVersion,
  markReleaseSeen,
  subscribeReleases,
} from '../lib/releases';

describe('releases lib (web mirror)', () => {
  beforeEach(() => {
    localStorage.clear();
    // The module caches `seen` once hydrated; resetting it per test would need
    // a module reload, so exercise the store through its own reset points:
    // markReleaseSeen stamps a fresh value, and the seed only runs once.
  });

  it('mirrors the core RELEASES list and quiet second entry', () => {
    expect(RELEASES.length).toBeGreaterThanOrEqual(2);
    expect(RELEASES[0].lines.length).toBeGreaterThan(0);
    expect(RELEASES[1].lines).toEqual([]);
  });

  it('stamps a fresh browser one release back so the newest reads once', () => {
    const seen = seenVersion();
    expect(seen).toBe(RELEASES[1].version);
  });

  it('shows the newest release for a role when unseen', () => {
    expect(releaseFor('admin')).toBe(RELEASES[0]);
    expect(releaseUnseen('admin', seenVersion())).toBe(RELEASES[0]);
    expect(releaseShow('admin', false, seenVersion())).toBe(RELEASES[0]);
  });

  it('holds the sheet back inside the on-campus window', () => {
    expect(releaseShow('admin', true, seenVersion())).toBeNull();
  });

  it('marks seen and stops showing', () => {
    markReleaseSeen(RELEASES[0].version);
    expect(releaseUnseen('admin', seenVersion())).toBeNull();
  });

  it('notifies subscribers when marked seen', () => {
    let calls = 0;
    const unsub = subscribeReleases(() => calls++);
    markReleaseSeen('x');
    expect(calls).toBe(1);
    unsub();
  });

  it('formats dates like the design', () => {
    expect(releaseDateWords('2026-08-25')).toMatch(/25/i);
    expect(releaseDateWords('nonsense')).toBe('');
  });
});