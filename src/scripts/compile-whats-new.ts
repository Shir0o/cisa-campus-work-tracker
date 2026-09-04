export type PlatformTarget = 'web' | 'mobile';

export interface WhatsNewItem {
  text: string;
  platforms: PlatformTarget[];
}

export interface WhatsNewRelease {
  id: string;
  version: string;
  title: string;
  date: string;
  platforms: PlatformTarget[];
  overview?: string;
  items: WhatsNewItem[];
}

export interface WhatsNewManifest {
  latestReleaseId: string | null;
  releases: WhatsNewRelease[];
}

/**
 * Parses markdown with simple YAML frontmatter and bullet points with [Web]/[Mobile] platform tags.
 */
export function parseWhatsNewMarkdown(raw: string): WhatsNewRelease {
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error('Invalid markdown format: missing frontmatter block');
  }

  const frontmatterStr = frontmatterMatch[1];
  const bodyStr = frontmatterMatch[2];

  const frontmatter: Record<string, any> = {};
  let currentArrayKey: string | null = null;

  for (const line of frontmatterStr.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const arrayItemMatch = trimmed.match(/^-\s+(.+)$/);
    if (arrayItemMatch && currentArrayKey) {
      if (!Array.isArray(frontmatter[currentArrayKey])) {
        frontmatter[currentArrayKey] = [];
      }
      frontmatter[currentArrayKey].push(arrayItemMatch[1].trim().replace(/^['"](.*)['"]$/, '$1'));
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

  const id = frontmatter.id || '';
  const version = frontmatter.version || '';
  const title = frontmatter.title || '';
  const date = frontmatter.date || '';
  const platforms: PlatformTarget[] = Array.isArray(frontmatter.platforms) && frontmatter.platforms.length > 0
    ? (frontmatter.platforms as PlatformTarget[])
    : ['web', 'mobile'];

  // Parse body: extract overview and bullet items
  const lines = bodyStr.split('\n');
  const overviewLines: string[] = [];
  const items: WhatsNewItem[] = [];

  let inOverview = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# Overview')) {
      inOverview = true;
      continue;
    }

    if (trimmed.startsWith('#')) {
      inOverview = false;
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      inOverview = false;
      let text = bulletMatch[1].trim();
      let itemPlatforms: PlatformTarget[] = ['web', 'mobile'];

      if (/^\[Web\]/i.test(text)) {
        itemPlatforms = ['web'];
        text = text.replace(/^\[Web\]\s*/i, '');
      } else if (/^\[Mobile\]/i.test(text)) {
        itemPlatforms = ['mobile'];
        text = text.replace(/^\[Mobile\]\s*/i, '');
      }

      items.push({ text, platforms: itemPlatforms });
    } else if (inOverview) {
      overviewLines.push(trimmed);
    }
  }

  return {
    id,
    version,
    title,
    date,
    platforms,
    overview: overviewLines.length > 0 ? overviewLines.join('\n') : undefined,
    items,
  };
}

/**
 * Compiles a list of raw markdown documents into a sorted manifest.
 */
export function compileWhatsNewManifest(markdownDocs: string[]): WhatsNewManifest {
  const releases = markdownDocs
    .map(parseWhatsNewMarkdown)
    .sort((a, b) => b.id.localeCompare(a.id));

  return {
    latestReleaseId: releases.length > 0 ? releases[0].id : null,
    releases,
  };
}

/**
 * Converts conventional git commits into a clean starter markdown draft.
 */
export function parseGitCommitsToDraft(
  commitLines: string[],
  meta: { version: string; date: string; id?: string; title?: string }
): string {
  const id = meta.id || `${meta.date}-v${meta.version}`;
  const title = meta.title || `Release ${meta.version}`;

  const bullets: string[] = [];
  for (const line of commitLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Filter to user-facing feats and fixes
    const featMatch = trimmed.match(/^feat(?:\(([^)]+)\))?:\s*(.+)$/i);
    const fixMatch = trimmed.match(/^fix(?:\(([^)]+)\))?:\s*(.+)$/i);

    if (featMatch) {
      const scope = featMatch[1]?.toLowerCase();
      let desc = featMatch[2].replace(/\s*\([^)]*#\d+[^)]*\)/g, '').trim();
      desc = desc.charAt(0).toUpperCase() + desc.slice(1);
      const tag = scope === 'mobile' ? '[Mobile] ' : scope === 'web' ? '[Web] ' : '';
      bullets.push(`- ${tag}${desc}`);
    } else if (fixMatch) {
      const scope = fixMatch[1]?.toLowerCase();
      let desc = fixMatch[2].replace(/\s*\([^)]*#\d+[^)]*\)/g, '').trim();
      desc = desc.charAt(0).toUpperCase() + desc.slice(1);
      const tag = scope === 'mobile' ? '[Mobile] ' : scope === 'web' ? '[Web] ' : '';
      bullets.push(`- ${tag}${desc}`);
    }
  }

  return `---
id: ${id}
version: ${meta.version}
title: "${title}"
date: "${meta.date}"
platforms:
  - web
  - mobile
---

# Overview
Highlights and updates in this release.

## Highlights
${bullets.length > 0 ? bullets.join('\n') : '- General stability and performance improvements'}
`;
}
