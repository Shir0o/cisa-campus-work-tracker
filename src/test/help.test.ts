import { describe, it, expect } from 'vitest';
import {
  visibleHelpPages,
  helpPageForRole,
  helpContentForLocale,
} from '../lib/help';
import type { HelpManifest, HelpPage } from '../scripts/compile-help';

const page = (over: Partial<HelpPage> & { slug: string }): HelpPage => ({
  order: 1,
  content: {
    en: { title: over.slug, body: `${over.slug} body` },
    es: { title: over.slug, body: `${over.slug} body` },
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
    const slugs = visibleHelpPages(manifest, 'viewer').map((p) => p.slug);
    expect(slugs).toEqual(['everyone']);
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
    expect(visibleHelpPages(manifest, 'operator').map((p) => p.slug)).toEqual(['everyone']);
  });

  it('hides audience pages when there is no role', () => {
    expect(visibleHelpPages(manifest, null).map((p) => p.slug)).toEqual(['everyone']);
  });

  it('does not grant an admin super-power over a page listed for another role', () => {
    const onlyViewer: HelpManifest = { pages: [page({ slug: 'community', audience: ['viewer'] })] };
    expect(visibleHelpPages(onlyViewer, 'admin')).toEqual([]);
  });
});

describe('helpPageForRole', () => {
  it('returns a visible page by slug', () => {
    expect(helpPageForRole(manifest, 'manager', 'staff')?.slug).toBe('staff');
  });

  it('returns undefined for a hidden page (route resolves as not-found)', () => {
    expect(helpPageForRole(manifest, 'viewer', 'admins')).toBeUndefined();
  });

  it('returns undefined for an unknown slug', () => {
    expect(helpPageForRole(manifest, 'admin', 'missing')).toBeUndefined();
  });
});

describe('helpContentForLocale', () => {
  it('returns the requested locale when authored', () => {
    const translated = page({
      slug: 'welcome',
      content: {
        en: { title: 'Welcome', body: 'Hello' },
        es: { title: 'Bienvenido', body: 'Hola' },
      },
    });
    expect(helpContentForLocale(translated, 'es')).toEqual({ title: 'Bienvenido', body: 'Hola' });
  });

  it('falls back to English when the locale is not authored', () => {
    const englishOnly = {
      slug: 'welcome',
      order: 1,
      content: { en: { title: 'Welcome', body: 'Hello' } },
    } as unknown as HelpPage;
    expect(helpContentForLocale(englishOnly, 'es')).toEqual({ title: 'Welcome', body: 'Hello' });
  });
});
