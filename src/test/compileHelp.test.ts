import { describe, it, expect } from 'vitest';
import {
  parseHelpMarkdown,
  compileHelpManifest,
  type HelpSource,
} from '../scripts/compile-help';

const page = (slug: string, locale: 'en' | 'es', raw: string): HelpSource => ({
  slug,
  locale,
  raw,
});

describe('parseHelpMarkdown', () => {
  it('parses the minimal frontmatter and leaves the body as written', () => {
    const raw = `---
title: Getting Started
order: 1
---

# Welcome

Say hello.`;

    const parsed = parseHelpMarkdown(raw);
    expect(parsed.title).toBe('Getting Started');
    expect(parsed.order).toBe(1);
    expect(parsed.category).toBeUndefined();
    expect(parsed.audience).toBeUndefined();
    expect(parsed.body).toBe('# Welcome\n\nSay hello.');
  });

  it('parses an optional category', () => {
    const raw = `---
title: Approvals
order: 3
category: Managers
---
Approve things.`;
    expect(parseHelpMarkdown(raw).category).toBe('Managers');
  });

  it('parses an audience list of canonical roles', () => {
    const raw = `---
title: Admin Console
order: 2
audience:
  - admin
  - manager
---
Body`;
    expect(parseHelpMarkdown(raw).audience).toEqual(['admin', 'manager']);
  });

  it('treats an empty audience list as everyone', () => {
    const raw = `---
title: Everyone
order: 5
audience:
---
Body`;
    expect(parseHelpMarkdown(raw).audience).toBeUndefined();
  });

  it('rejects an unknown audience role', () => {
    const raw = `---
title: Wrong
order: 1
audience:
  - treasurer
---
Body`;
    expect(() => parseHelpMarkdown(raw)).toThrow(/treasurer/);
  });

  it('rejects markdown without a frontmatter block', () => {
    expect(() => parseHelpMarkdown('# No frontmatter')).toThrow(/frontmatter/i);
  });

  it('rejects a non-numeric order', () => {
    const raw = `---
title: Broken
order: soon
---
Body`;
    expect(() => parseHelpMarkdown(raw)).toThrow(/order/i);
  });
});

describe('compileHelpManifest', () => {
  it('orders English pages by their order', () => {
    const manifest = compileHelpManifest([
      page(
        'second',
        'en',
        `---
title: Second
order: 2
---
Second body`,
      ),
      page(
        'first',
        'en',
        `---
title: First
order: 1
---
First body`,
      ),
    ]);

    expect(manifest.pages.map((p) => p.slug)).toEqual(['first', 'second']);
  });

  it('breaks ties on order by slug', () => {
    const manifest = compileHelpManifest([
      page('zeta', 'en', `---\ntitle: Zeta\norder: 1\n---\nZ`),
      page('alpha', 'en', `---\ntitle: Alpha\norder: 1\n---\nA`),
    ]);

    expect(manifest.pages.map((p) => p.slug)).toEqual(['alpha', 'zeta']);
  });

  it('falls a page back to English when no Spanish is authored', () => {
    const manifest = compileHelpManifest([
      page('welcome', 'en', `---\ntitle: Welcome\norder: 1\n---\nHello`),
    ]);

    const welcome = manifest.pages[0];
    expect(welcome.content.en).toEqual({ title: 'Welcome', body: 'Hello' });
    expect(welcome.content.es).toEqual({ title: 'Welcome', body: 'Hello' });
  });

  it('uses the Spanish title and body when authored', () => {
    const manifest = compileHelpManifest([
      page('welcome', 'en', `---\ntitle: Welcome\norder: 1\n---\nHello`),
      page('welcome', 'es', `---\ntitle: Bienvenido\norder: 1\n---\nHola`),
    ]);

    const welcome = manifest.pages[0];
    expect(welcome.content.en).toEqual({ title: 'Welcome', body: 'Hello' });
    expect(welcome.content.es).toEqual({ title: 'Bienvenido', body: 'Hola' });
  });

  it('rejects a slug with no English source', () => {
    expect(() =>
      compileHelpManifest([
        page('solo', 'es', `---\ntitle: Solo\norder: 1\n---\nHola`),
      ]),
    ).toThrow(/English/);
  });

  it('carries category and audience from the English page', () => {
    const manifest = compileHelpManifest([
      page(
        'approvals',
        'en',
        `---
title: Approvals
order: 4
category: Managers
audience:
  - manager
---
Body`,
      ),
    ]);

    expect(manifest.pages[0].category).toBe('Managers');
    expect(manifest.pages[0].audience).toEqual(['manager']);
  });
});
