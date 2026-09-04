import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldShowWhatsNew,
  markWhatsNewSeen,
  getWhatsNewForPlatform,
  createWhatsNewState,
} from './whatsNew';
import type { WhatsNewManifest, WhatsNewRelease } from '../scripts/compile-whats-new';

describe('whatsNew Service', () => {
  const sampleManifest: WhatsNewManifest = {
    latestReleaseId: '2026-09-03-v1.4.0',
    releases: [
      {
        id: '2026-09-03-v1.4.0',
        version: '1.4.0',
        title: 'September Release',
        date: '2026-09-03',
        platforms: ['web', 'mobile'],
        items: [
          { text: 'Web feature', platforms: ['web'] },
          { text: 'Mobile feature', platforms: ['mobile'] },
          { text: 'Shared feature', platforms: ['web', 'mobile'] },
        ],
      },
      {
        id: '2026-08-01-v1.3.0',
        version: '1.3.0',
        title: 'August Release',
        date: '2026-08-01',
        platforms: ['web'],
        items: [{ text: 'Old web feature', platforms: ['web'] }],
      },
    ],
  };

  it('filters items strictly by platform target', () => {
    const webRelease = getWhatsNewForPlatform(sampleManifest.releases[0], 'web');
    expect(webRelease?.items).toEqual([
      { text: 'Web feature', platforms: ['web'] },
      { text: 'Shared feature', platforms: ['web', 'mobile'] },
    ]);

    const mobileRelease = getWhatsNewForPlatform(sampleManifest.releases[0], 'mobile');
    expect(mobileRelease?.items).toEqual([
      { text: 'Mobile feature', platforms: ['mobile'] },
      { text: 'Shared feature', platforms: ['web', 'mobile'] },
    ]);
  });

  it('returns null if the release does not support the requested platform', () => {
    const mobileRelease = getWhatsNewForPlatform(sampleManifest.releases[1], 'mobile');
    expect(mobileRelease).toBeNull();
  });

  it('determines if popup should show based on lastSeenId and platform', () => {
    // Never seen before: should show
    expect(shouldShowWhatsNew(sampleManifest, null, 'web')).toBe(true);

    // Seen older release: should show
    expect(shouldShowWhatsNew(sampleManifest, '2026-08-01-v1.3.0', 'web')).toBe(true);

    // Seen latest release: should NOT show
    expect(shouldShowWhatsNew(sampleManifest, '2026-09-03-v1.4.0', 'web')).toBe(false);

    // Seen something newer than manifest: should NOT show
    expect(shouldShowWhatsNew(sampleManifest, '2026-10-01-v1.5.0', 'web')).toBe(false);
  });

  it('manages storage through the adapter correctly', () => {
    let storedVal: string | null = null;
    const mockStorage = {
      getItem: () => storedVal,
      setItem: (val: string) => {
        storedVal = val;
      },
    };

    const state = createWhatsNewState(mockStorage, 'web');
    expect(state.getLastSeenId()).toBeNull();
    expect(state.shouldShow(sampleManifest)).toBe(true);

    state.markSeen('2026-09-03-v1.4.0');
    expect(storedVal).toBe('2026-09-03-v1.4.0');
    expect(state.getLastSeenId()).toBe('2026-09-03-v1.4.0');
    expect(state.shouldShow(sampleManifest)).toBe(false);
  });
});
