import type { AppRole } from '../lib/permissions';

export type HelpLocale = 'en' | 'es';

export interface HelpSource {
  slug: string;
  locale: HelpLocale;
  raw: string;
}

export interface HelpLocaleContent {
  title: string;
  body: string;
}

export interface HelpParsedPage {
  title: string;
  order: number;
  category?: string;
  audience?: AppRole[];
  body: string;
}

export interface HelpPage {
  slug: string;
  order: number;
  category?: string;
  audience?: AppRole[];
  content: Record<HelpLocale, HelpLocaleContent>;
}

export interface HelpManifest {
  pages: HelpPage[];
}

const CANONICAL_ROLES: AppRole[] = ['admin', 'manager', 'operator', 'viewer'];

/** Parses a help page's minimal YAML frontmatter and its markdown body. */
export function parseHelpMarkdown(raw: string): HelpParsedPage {
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error('Invalid markdown format: missing frontmatter block');
  }

  const frontmatter: Record<string, string | string[]> = {};
  let currentArrayKey: string | null = null;

  for (const line of frontmatterMatch[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const arrayItemMatch = trimmed.match(/^-\s+(.+)$/);
    if (arrayItemMatch && currentArrayKey) {
      const values = frontmatter[currentArrayKey];
      if (Array.isArray(values)) {
        values.push(arrayItemMatch[1].trim().replace(/^['"](.*)['"]$/, '$1'));
      }
      continue;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim();
      if (!val) {
        currentArrayKey = key;
        frontmatter[key] = [];
      } else {
        currentArrayKey = null;
        frontmatter[key] = val.replace(/^['"](.*)['"]$/, '$1');
      }
    }
  }

  const title = typeof frontmatter.title === 'string' ? frontmatter.title : '';
  if (!title) {
    throw new Error('Help page is missing a title');
  }

  const order = Number(frontmatter.order);
  if (!Number.isFinite(order)) {
    throw new Error(`Help page "${title}" has a non-numeric order`);
  }

  const category = typeof frontmatter.category === 'string' ? frontmatter.category : undefined;

  let audience: AppRole[] | undefined;
  if (Array.isArray(frontmatter.audience) && frontmatter.audience.length > 0) {
    audience = frontmatter.audience.map((role) => {
      if (!CANONICAL_ROLES.includes(role as AppRole)) {
        throw new Error(`Help page "${title}" has an unknown audience role: ${role}`);
      }
      return role as AppRole;
    });
  }

  return {
    title,
    order,
    ...(category ? { category } : {}),
    ...(audience ? { audience } : {}),
    body: frontmatterMatch[2].trim(),
  };
}

/** Compiles authored help sources into an ordered, English-fallback manifest. */
export function compileHelpManifest(sources: HelpSource[]): HelpManifest {
  const grouped = new Map<string, Partial<Record<HelpLocale, HelpParsedPage>>>();

  for (const source of sources) {
    const parsed = parseHelpMarkdown(source.raw);
    const byLocale = grouped.get(source.slug) ?? {};
    byLocale[source.locale] = parsed;
    grouped.set(source.slug, byLocale);
  }

  const pages: HelpPage[] = [];
  for (const [slug, byLocale] of grouped) {
    const en = byLocale.en;
    if (!en) {
      throw new Error(`Help page "${slug}" is missing its English source`);
    }

    const es = byLocale.es;
    pages.push({
      slug,
      order: en.order,
      ...(en.category ? { category: en.category } : {}),
      ...(en.audience ? { audience: en.audience } : {}),
      content: {
        en: { title: en.title, body: en.body },
        es: es ? { title: es.title, body: es.body } : { title: en.title, body: en.body },
      },
    });
  }

  pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  return { pages };
}
