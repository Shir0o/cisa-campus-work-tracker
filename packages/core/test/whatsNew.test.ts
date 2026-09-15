import { describe, expect, it } from 'vitest';
import {
  getWhatsNewForPlatform,
  latestRelease,
  nudgeFor,
  releaseDateWords,
  releaseShow,
  SEEN_RELEASE_STORAGE_KEY,
  shouldShowAnnouncement,
  type WhatsNewManifest,
} from '../src/whatsNew';

const manifest: WhatsNewManifest = {
  latestReleaseId: '2026-09-03-v1.4.0',
  releases: [
    {
      id: '2026-09-03-v1.4.0',
      version: '1.4.0',
      title: 'September Platform & Mobile Updates',
      date: '2026-09-03',
      platforms: ['web', 'mobile'],
      roles: ['admin', 'manager', 'operator', 'viewer'],
      lines: ['A personal line.', 'Another personal line.'],
      overview: 'Overview',
      items: [
        { text: 'Web only thing', platforms: ['web'], category: 'feature' },
        { text: 'Mobile only thing', platforms: ['mobile'], category: 'ui' },
        { text: 'Everyone thing', platforms: ['web', 'mobile'], category: 'fix' },
      ],
    },
    {
      id: '2026-08-25-v0.1.0',
      version: '0.1.0',
      title: 'Quiet',
      date: '2026-08-25',
      platforms: ['web', 'mobile'],
      lines: [],
      items: [],
    },
  ],
};

describe('SEEN_RELEASE_STORAGE_KEY', () => {
  it('is the one key web and phone agree on', () => {
    expect(SEEN_RELEASE_STORAGE_KEY).toBe('cisa.whats_new.last_seen_id');
  });
});

describe('latestRelease', () => {
  it('returns the release the manifest names as latest', () => {
    expect(latestRelease(manifest)?.id).toBe('2026-09-03-v1.4.0');
  });

  it('returns null for an empty manifest', () => {
    expect(latestRelease({ latestReleaseId: null, releases: [] })).toBeNull();
  });
});

describe('getWhatsNewForPlatform', () => {
  it('keeps only the items that belong on the platform', () => {
    const release = latestRelease(manifest)!;
    expect(getWhatsNewForPlatform(release, 'web')?.items.map((i) => i.text)).toEqual([
      'Web only thing',
      'Everyone thing',
    ]);
  });

  it('returns null when the release does not target the platform', () => {
    const webOnly = { ...manifest.releases[0], platforms: ['web'] as const };
    expect(getWhatsNewForPlatform(webOnly, 'mobile')).toBeNull();
  });
});

describe('shouldShowAnnouncement', () => {
  it('shows the latest release while it is unseen', () => {
    expect(shouldShowAnnouncement(manifest, '2026-01-01-old', 'web')).toBe(true);
  });

  it('hides the latest release once its id is seen', () => {
    expect(shouldShowAnnouncement(manifest, '2026-09-03-v1.4.0', 'web')).toBe(false);
  });

  it('shows on a clean device with no record', () => {
    expect(shouldShowAnnouncement(manifest, null, 'web')).toBe(true);
  });
});

describe('nudgeFor', () => {
  it('returns the latest release for a role it speaks to', () => {
    expect(nudgeFor(manifest, 'admin', '0.1.0')?.id).toBe('2026-09-03-v1.4.0');
  });

  it('hides once the latest release has been seen', () => {
    expect(nudgeFor(manifest, 'admin', '2026-09-03-v1.4.0')).toBeNull();
  });

  it('hides when the role is not admitted', () => {
    const restricted: WhatsNewManifest = {
      latestReleaseId: 'x',
      releases: [{ ...manifest.releases[0], id: 'x', roles: ['admin'] }, manifest.releases[1]],
    };
    expect(nudgeFor(restricted, 'viewer', null)).toBeNull();
  });

  it('treats an omitted roles list as everyone', () => {
    const open: WhatsNewManifest = {
      latestReleaseId: 'x',
      releases: [{ ...manifest.releases[0], id: 'x', roles: undefined }, manifest.releases[1]],
    };
    expect(nudgeFor(open, 'viewer', null)?.id).toBe('x');
  });

  it('never falls back to an older release when the latest is quiet', () => {
    const quiet: WhatsNewManifest = {
      latestReleaseId: 'quiet',
      releases: [{ ...manifest.releases[1], id: 'quiet' }, manifest.releases[0]],
    };
    expect(nudgeFor(quiet, 'admin', null)).toBeNull();
  });
});

describe('releaseShow', () => {
  it('holds the nudge back while the on-campus window is open', () => {
    expect(releaseShow(manifest, 'admin', true, null)).toBeNull();
  });

  it('shows the nudge when outside the window and unseen', () => {
    expect(releaseShow(manifest, 'admin', false, null)?.id).toBe('2026-09-03-v1.4.0');
  });
});

describe('releaseDateWords', () => {
  it('formats a date-only ISO string as a day and month', () => {
    expect(releaseDateWords('2026-08-25')).toMatch(/25/);
    expect(releaseDateWords('2026-08-25')).toMatch(/august/i);
  });

  it('returns empty for a bad string instead of throwing', () => {
    expect(releaseDateWords('not-a-date')).toBe('');
  });
});
