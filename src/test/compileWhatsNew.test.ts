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

  describe('automated release curation and simplification (TDD)', () => {
    it('filters out excluded scopes even on feat and fix types', () => {
      const commits = [
        'feat: add prayer request reminder notifications',
        'feat(deps): upgrade firebase sdk',
        'fix(chore): clean up orphan collections',
        'feat(ci): automate build uploads',
        'fix(test): mock out auth session',
        'feat(build): optimize bundle chunking',
        'fix(refactor): restructure contact actions',
        'feat(style): tweak modal spacing',
        'fix(internal): fix db index config',
        'fix(security): sanitize input tags',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      expect(draft).toContain('Add prayer request reminder notifications');
      expect(draft).not.toContain('Upgrade firebase sdk');
      expect(draft).not.toContain('Clean up orphan collections');
      expect(draft).not.toContain('Automate build uploads');
      expect(draft).not.toContain('Mock out auth session');
      expect(draft).not.toContain('Optimize bundle chunking');
      expect(draft).not.toContain('Restructure contact actions');
      expect(draft).not.toContain('Tweak modal spacing');
      expect(draft).not.toContain('Fix db index config');
      expect(draft).not.toContain('Sanitize input tags');
    });

    it('filters out technical jargon and CVE keywords matching JARGON_REGEX', () => {
      const commits = [
        'fix: resolve polynomial ReDoS in path parser',
        'feat: bump minimatch dependency',
        'fix: handle slugNamePart edge cases in routing',
        'fix: update regex to prevent catastrophic backtracking',
        'fix: vitest worker timeout on startup',
        'fix: vite server hmr bug',
        'fix: eslint config syntax error',
        'fix: playwright flaky locator in contact journey',
        'fix: emulator connection fallback',
        'fix: ruleset evaluation issue',
        'fix: nullish coalescing check in profile',
        'fix: firestore rules denial for group admins',
        'fix: fix typedef for user role',
        'fix: polyfill crypto.randomUUID',
        'fix: linter warning on unused import',
        'fix: regenerate lockfile for npm audit',
        'feat: export member contacts as csv',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      expect(draft).toContain('Export member contacts as csv');
      expect(draft).not.toContain('ReDoS');
      expect(draft).not.toContain('minimatch');
      expect(draft).not.toContain('slugNamePart');
      expect(draft).not.toContain('vitest');
      expect(draft).not.toContain('playwright');
      expect(draft).not.toContain('emulator');
      expect(draft).not.toContain('ruleset');
      expect(draft).not.toContain('firestore rules');
    });

    it('caps primary highlights to 4 items prioritizing features before fixes', () => {
      const commits = [
        'fix: fix profile image upload error',
        'feat: new dark mode appearance',
        'fix: resolve address validation failure',
        'feat: custom tags for prayer lists',
        'feat: audio bible playback support',
        'feat: keyboard navigation in contacts',
        'feat: offline syncing indicator',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      // 5 feats exist, but only up to 4 should be taken
      expect(draft).toContain('New dark mode appearance');
      expect(draft).toContain('Custom tags for prayer lists');
      expect(draft).toContain('Audio bible playback support');
      expect(draft).toContain('Keyboard navigation in contacts');
      expect(draft).not.toContain('Offline syncing indicator');
      // Fixes should be displaced because feats took all 4 slots
      expect(draft).not.toContain('Fix profile image upload error');
      expect(draft).not.toContain('Resolve address validation failure');
    });

    it('appends rollup bullet when eligible fixes are omitted due to the cap', () => {
      const commits = [
        'feat: audio bible playback support',
        'feat: keyboard navigation in contacts',
        'feat: new dark mode appearance',
        'fix: fix profile image upload error',
        'fix: resolve address validation failure',
        'fix: fix phone number formatting in drawer',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      // 3 feats + 1 fix fill 4 slots. Remaining 2 fixes omitted -> rollup bullet appended
      expect(draft).toContain('Audio bible playback support');
      expect(draft).toContain('Keyboard navigation in contacts');
      expect(draft).toContain('New dark mode appearance');
      expect(draft).toContain('Fix profile image upload error');
      expect(draft).not.toContain('Resolve address validation failure');
      expect(draft).not.toContain('Fix phone number formatting in drawer');
      expect(draft).toContain('- General bug fixes and stability improvements');
    });

    it('does not append rollup bullet when all eligible fixes fit within the cap', () => {
      const commits = [
        'feat: audio bible playback support',
        'feat: keyboard navigation in contacts',
        'fix: fix profile image upload error',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      expect(draft).toContain('Audio bible playback support');
      expect(draft).toContain('Keyboard navigation in contacts');
      expect(draft).toContain('Fix profile image upload error');
      expect(draft).not.toContain('General bug fixes and stability improvements');
    });

    it('does not append rollup bullet if no fixes were omitted (e.g. only feats were omitted)', () => {
      const commits = [
        'feat: feature 1',
        'feat: feature 2',
        'feat: feature 3',
        'feat: feature 4',
        'feat: feature 5',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      expect(draft).not.toContain('General bug fixes and stability improvements');
    });

    it('falls back to general stability when 0 items qualify', () => {
      const commits = [
        'chore(deps): bump vite from 6.0 to 6.1',
        'fix(ci): fix release pipeline',
        'feat(internal): add analytics tracking script',
        'fix: resolve polynomial ReDoS in regex',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      expect(draft).toContain('- General stability and performance improvements');
      // Frontmatter lines should also reflect the fallback
      expect(draft).toContain('lines:\n  - General stability and performance improvements.');
    });

    it('mirrors the capped sentences in frontmatter lines (up to 4 lines)', () => {
      const commits = [
        'feat: audio bible playback support',
        'feat: keyboard navigation in contacts',
        'fix: fix profile image upload error',
        'fix: resolve address validation failure',
        'fix: fix phone number formatting in drawer',
      ];

      const draft = parseGitCommitsToDraft(commits, { version: '1.5.0', date: '2026-10-01' });
      // Frontmatter lines should take up to 4 clean sentences from the highlights (without markdown bullets or tags)
      expect(draft).toContain(
        'lines:\n' +
        '  - Audio bible playback support.\n' +
        '  - Keyboard navigation in contacts.\n' +
        '  - Fix profile image upload error.\n' +
        '  - Resolve address validation failure.'
      );
    });
  });

  it('parses an optional video_url companion for the What\'s New Video', () => {
    const md = `---
id: 2026-09-17-v1.6.0
version: 1.6.0
title: "With Video"
date: "2026-09-17"
video_url: "https://www.youtube.com/watch?v=abc123"
---

- A change
`;
    const release = parseWhatsNewMarkdown(md);
    expect(release.video_url).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('leaves video_url absent when a release has none', () => {
    const md = `---
id: 2026-09-06-v1.5.1
version: 1.5.1
title: "Quiet"
date: "2026-09-06"
---

- A quiet patch
`;
    const release = parseWhatsNewMarkdown(md);
    expect(release.video_url).toBeUndefined();
    expect(release.video_roles).toBeUndefined();
  });

  it('parses video_roles for What\'s New video companion', () => {
    const md = `---
id: 2026-09-07-v1.6.0
version: 1.6.0
title: "Admin Tools"
date: "2026-09-07"
video_url: "https://drive.google.com/file/d/testVideoId/view"
video_roles:
  - admin
---

- New administrative console
`;
    const release = parseWhatsNewMarkdown(md);
    expect(release.video_url).toBe('https://drive.google.com/file/d/testVideoId/view');
    expect(release.video_roles).toEqual(['admin']);
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
