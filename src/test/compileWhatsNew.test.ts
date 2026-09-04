import { describe, it, expect } from 'vitest';
import { parseWhatsNewMarkdown, compileWhatsNewManifest, parseGitCommitsToDraft } from '../scripts/compile-whats-new.ts';

describe('WhatsNew Compiler & Parser', () => {
  it('parses frontmatter and items from a markdown string with platform annotations', () => {
    const markdown = `---
id: 2026-09-03-v1.4.0
version: 1.4.0
title: "September Ministry Updates"
date: "2026-09-03"
platforms:
  - web
  - mobile
---

# Overview
Here are the latest updates.

## Highlights
- [Web] Fast keyboard shortcuts with ⌘K palette
- [Mobile] Native push notifications for thread mentions
- Simplified prayer fold and history tracking
`;

    const parsed = parseWhatsNewMarkdown(markdown);

    expect(parsed.id).toBe('2026-09-03-v1.4.0');
    expect(parsed.version).toBe('1.4.0');
    expect(parsed.title).toBe('September Ministry Updates');
    expect(parsed.date).toBe('2026-09-03');
    expect(parsed.platforms).toEqual(['web', 'mobile']);
    expect(parsed.overview).toBe('Here are the latest updates.');
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toEqual({
      text: 'Fast keyboard shortcuts with ⌘K palette',
      platforms: ['web'],
    });
    expect(parsed.items[1]).toEqual({
      text: 'Native push notifications for thread mentions',
      platforms: ['mobile'],
    });
    expect(parsed.items[2]).toEqual({
      text: 'Simplified prayer fold and history tracking',
      platforms: ['web', 'mobile'],
    });
  });

  it('compiles multiple entries and sorts them newest first', () => {
    const entries = [
      {
        raw: `---
id: 2026-08-01-v1.0.0
version: 1.0.0
title: "Initial Release"
date: "2026-08-01"
---
- First version
`,
      },
      {
        raw: `---
id: 2026-09-03-v1.4.0
version: 1.4.0
title: "Latest Release"
date: "2026-09-03"
---
- Latest updates
`,
      },
    ];

    const manifest = compileWhatsNewManifest(entries.map((e) => e.raw));
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
  });
});
