import { describe, it, expect } from 'vitest';
import {
  parseWhatsNewMarkdown,
  compileWhatsNewManifest,
  parseGitCommitsToDraft,
  resolveDraftRangeBase,
} from '../scripts/compile-whats-new';

describe('compile-whats-new markdown & parser', () => {
  it('parses markdown with category sections into categorized items', () => {
    const md = `---
id: 2026-09-04-v1.4.1
version: 1.4.1
title: "Platform Updates"
date: "2026-09-04"
platforms:
  - web
  - mobile
---

# Overview
This release brings exciting new capabilities.

## New Features
- [Web] Fast keyboard shortcuts
- Audio Bible study playback

## UI/UX Updates
- [Mobile] Touch feedback optimization

## Bug Fixes
- Fixed avatar loading issue
`;

    const release = parseWhatsNewMarkdown(md);

    expect(release.title).toBe('Platform Updates');
    expect(release.overview).toBe('This release brings exciting new capabilities.');
    expect(release.items).toEqual([
      { text: 'Fast keyboard shortcuts', platforms: ['web'], category: 'feature' },
      { text: 'Audio Bible study playback', platforms: ['web', 'mobile'], category: 'feature' },
      { text: 'Touch feedback optimization', platforms: ['mobile'], category: 'ui' },
      { text: 'Fixed avatar loading issue', platforms: ['web', 'mobile'], category: 'fix' },
    ]);
  });

  it('supports inline category tags like [Feature], [UI], [Fix]', () => {
    const md = `---
id: 2026-09-04-v1.4.2
version: 1.4.2
title: "Quick Patch"
date: "2026-09-04"
---

# Overview
Patch release notes.

## Highlights
- [Feature] New search filter
- [UI/UX] Subtle animation in modal
- [Fix] Fixed date display
`;

    const release = parseWhatsNewMarkdown(md);
    expect(release.items).toEqual([
      { text: 'New search filter', platforms: ['web', 'mobile'], category: 'feature' },
      { text: 'Subtle animation in modal', platforms: ['web', 'mobile'], category: 'ui' },
      { text: 'Fixed date display', platforms: ['web', 'mobile'], category: 'fix' },
    ]);
  });

  it('compiles multiple entries and sorts them newest first', () => {
    const entries = [
      `---
id: 2026-08-01-v1.0.0
version: 1.0.0
title: "Initial Release"
date: "2026-08-01"
---
- First version
`,
      `---
id: 2026-09-03-v1.4.0
version: 1.4.0
title: "Latest Release"
date: "2026-09-03"
---
- Latest updates
`,
    ];

    const manifest = compileWhatsNewManifest(entries);
    expect(manifest.releases).toHaveLength(2);
    expect(manifest.releases[0].id).toBe('2026-09-03-v1.4.0');
    expect(manifest.releases[1].id).toBe('2026-08-01-v1.0.0');
    expect(manifest.latestReleaseId).toBe('2026-09-03-v1.4.0');
  });

  it('parses conventional git commit lines into a clean draft entry', () => {
    const commits = [
      'feat(mobile): push notification support (#761)',
      'fix(contacts): allow owner transfer when owner is unset (#802)',
      'chore(deps): bump vite from 6.0 to 6.1',
    ];

    const draft = parseGitCommitsToDraft(commits, { version: '1.4.0', date: '2026-09-03' });
    expect(draft).toContain('version: 1.4.0');
    expect(draft).toContain('[Mobile] Push notification support');
    expect(draft).toContain('Allow owner transfer when owner is unset');
    // chores should be omitted from user-facing release notes by default
    expect(draft).not.toContain('bump vite');
    expect(draft).toContain('lines:');
    expect(draft).toContain('Push notification support.');
  });

  it('parses the personal layer (roles + lines) for the Release Nudge', () => {
    const md = `---
id: 2026-09-05-v1.5.0
version: 1.5.0
title: "Nudge"
date: "2026-09-05"
platforms:
  - web
  - mobile
roles:
  - admin
  - manager
lines:
  - The queue tells you who is waiting.
  - Prayers sort by who has gone quiet.
---

- A bulletin
`;
    const release = parseWhatsNewMarkdown(md);
    expect(release.roles).toEqual(['admin', 'manager']);
    expect(release.lines).toEqual([
      'The queue tells you who is waiting.',
      'Prayers sort by who has gone quiet.',
    ]);
  });

  it('leaves the personal layer absent when a release is quiet', () => {
    const md = `---
id: 2026-09-06-v1.5.1
version: 1.5.1
title: "Quiet"
date: "2026-09-06"
---

- A quiet patch
`;
    const release = parseWhatsNewMarkdown(md);
    expect(release.roles).toBeUndefined();
    expect(release.lines).toBeUndefined();
  });
});

describe('resolveDraftRangeBase', () => {
  it('returns the newest authored version strictly below the target', () => {
    expect(
      resolveDraftRangeBase(['1.4.0', '1.5.0'], '1.6.0'),
    ).toBe('1.5.0');
  });

  it('ignores patch releases that share the target minor', () => {
    expect(
      resolveDraftRangeBase(['1.4.0', '1.5.0', '1.5.2'], '1.5.3'),
    ).toBe('1.5.2');
  });

  it('returns null when the target is the first authored version', () => {
    expect(resolveDraftRangeBase([], '1.6.0')).toBeNull();
    expect(resolveDraftRangeBase(['1.6.0'], '1.6.0')).toBeNull();
  });

  it('compares by numeric parts, not lexically', () => {
    expect(
      resolveDraftRangeBase(['1.9.0', '1.10.0'], '1.11.0'),
    ).toBe('1.10.0');
  });

  it('tolerates v-prefixed versions and drops junk', () => {
    expect(
      resolveDraftRangeBase(['v1.4.0', 'not-a-version', '1.5.0'], '1.6.0'),
    ).toBe('1.5.0');
  });
});
