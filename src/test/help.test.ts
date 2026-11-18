import { describe, it, expect } from 'vitest';
import {
  visibleHelpPages,
  helpPageForRole,
} from '../lib/help';
import type { HelpManifest, HelpPage } from '../scripts/compile-help';

const page = (over: Partial<HelpPage> & { slug: string }): HelpPage => ({
  order: 1,
  content: {
    en: { title: over.slug, body: `${over.slug} body` },
  },
  ...over,
});

const manifest: HelpManifest = {
  pages: [
    page({ slug: 'everyone' }),
    page({ slug: 'admins', audience: ['admin'] }),
    page({ slug: 'staff', audience: ['admin', 'manager'] }),
  ],
};

describe('visibleHelpPages', () => {
  it('shows an unset audience to every role', () => {
    for (const role of ['admin', 'manager']) {
      expect(visibleHelpPages(manifest, role).map((p) => p.slug)).toContain('everyone');
    }
  });

  it('shows a page whose audience lists the role', () => {
    expect(visibleHelpPages(manifest, 'admin').map((p) => p.slug)).toEqual([
      'everyone',
      'admins',
      'staff',
    ]);
    expect(visibleHelpPages(manifest, 'manager').map((p) => p.slug)).toEqual([
      'everyone',
      'staff',
    ]);
  });

  it('hides audience pages from a role not listed', () => {
    expect(visibleHelpPages(manifest, 'manager').map((p) => p.slug)).not.toContain('admins');
  });

  it('hides audience pages when there is no role', () => {
    expect(visibleHelpPages(manifest, null).map((p) => p.slug)).toEqual(['everyone']);
  });

  it('does not grant an admin super-power over a page listed for another role', () => {
    const onlyTrainees: HelpManifest = { pages: [page({ slug: 'trainees', audience: ['manager'] })] };
    expect(visibleHelpPages(onlyTrainees, 'admin')).toEqual([]);
  });
});

describe('helpPageForRole', () => {
  it('returns a visible page by slug', () => {
    expect(helpPageForRole(manifest, 'manager', 'staff')?.slug).toBe('staff');
  });

  it('returns undefined for a hidden page (route resolves as not-found)', () => {
    expect(helpPageForRole(manifest, 'manager', 'admins')).toBeUndefined();
  });

  it('returns undefined for an unknown slug', () => {
    expect(helpPageForRole(manifest, 'admin', 'missing')).toBeUndefined();
  });
});
