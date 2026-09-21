/**
 * Compile a `content/whats-new` manifest into plain-text store release notes.
 *
 * Why this exists
 * ---------------
 * ADR 0008 made `content/whats-new/*.md` the single authored home for "what
 * changed in this release". The stores want that same idea in their own shape —
 * Play caps a changelog at 500 characters per language, TestFlight's "What to
 * Test" allows far more — so these notes are compiled from that one source
 * rather than authored a second time. A second source of truth for one idea is
 * the drift ADR 0008 exists to prevent.
 *
 * Platform selection drops web-only bullets from a mobile release and strips
 * the platform tags it keeps.
 *
 * Usage
 * -----
 *   npx tsx scripts/store-release-notes.ts --platform play
 *   npx tsx scripts/store-release-notes.ts --platform testflight --version 1.4.0
 *   npx tsx scripts/store-release-notes.ts --platform play --out /tmp/notes.txt
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content/whats-new');

/** Play Console caps a changelog at 500 characters per language. */
export const LIMITS: Record<string, number> = { play: 500, testflight: 4000 };

interface Manifest {
  file: string;
  version: string;
  date: string;
  bullets: string[];
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readFrontmatter(raw: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (match === null) return {};
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line.trim());
    if (kv) fields[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return fields;
}

/** Strip the markdown a store listing will not render. */
function toPlainText(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function readManifests(): Manifest[] {
  if (!fs.existsSync(CONTENT_DIR)) {
    throw new Error('No content/whats-new directory.');
  }

  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
      const fields = readFrontmatter(raw);
      const body = raw.replace(/^---\n[\s\S]*?\n---/, '');

      const bullets = body
        .split('\n')
        .filter((line) => /^\s*[-*]\s+\S/.test(line))
        .map((line) => toPlainText(line.replace(/^\s*[-*]\s+/, '')))
        .filter((line) => line.length > 0);

      return { file, version: fields.version ?? '', date: fields.date ?? '', bullets };
    })
    .sort((a, b) => (a.date === b.date ? a.file.localeCompare(b.file) : a.date.localeCompare(b.date)));
}

function selectManifest(manifests: Manifest[], version: string | undefined): Manifest {
  if (manifests.length === 0) {
    throw new Error('No markdown manifests in content/whats-new.');
  }
  if (!version) return manifests[manifests.length - 1];

  const match = manifests.find((manifest) => manifest.version === version);
  if (!match) {
    throw new Error(
      `No whats-new manifest declares version ${version}. Found: ${manifests
        .map((manifest) => manifest.version || manifest.file)
        .join(', ')}`,
    );
  }
  return match;
}

/** Keep mobile-relevant bullets, drop web-only ones, strip the platform tag. */
export function keepForPlatform(bullets: string[], platform: string): string[] {
  if (platform !== 'play' && platform !== 'testflight') return bullets;
  return bullets
    .filter((bullet) => !/^\[Web\]/i.test(bullet))
    .map((bullet) => bullet.replace(/^\[Mobile\]\s*/i, '').trim())
    .filter((bullet) => bullet.length > 0);
}

export function fitToLimit(bullets: string[], limit: number): string {
  const kept: string[] = [];
  for (const bullet of bullets) {
    const candidate = [...kept, bullet].map((entry) => `\u2022 ${entry}`).join('\n');
    if (candidate.length > limit) break;
    kept.push(bullet);
  }

  if (kept.length > 0) return kept.map((entry) => `\u2022 ${entry}`).join('\n');

  // Nothing fits whole — truncate the first bullet rather than ship emptiness.
  // Prefix is "• " (2 chars) and suffix is "…" (1 char), so slice content to limit - 3.
  const first = bullets[0] ?? 'Bug fixes and improvements.';
  const maxContentLength = Math.max(0, limit - 3);
  return `\u2022 ${first.slice(0, maxContentLength).trimEnd()}\u2026`;
}

export function formatStoreReleaseNotes(bullets: string[], platform: string): string {
  const limit = LIMITS[platform];
  if (!limit) {
    throw new Error(
      `Unknown --platform '${platform}'. Expected one of: ${Object.keys(LIMITS).join(', ')}.`,
    );
  }
  const filtered = keepForPlatform(bullets, platform);
  if (filtered.length === 0) {
    throw new Error(`No bullets usable for ${platform}.`);
  }
  return fitToLimit(filtered, limit);
}

export function main(): void {
  const platform = argValue('--platform') ?? 'play';
  const manifest = selectManifest(readManifests(), argValue('--version'));
  const limit = LIMITS[platform];
  const notes = formatStoreReleaseNotes(manifest.bullets, platform);
  const out = argValue('--out');
  if (out) {
    fs.writeFileSync(out, notes, 'utf8');
    console.log(`Wrote ${notes.length}/${limit} chars to ${out} (from ${manifest.file}).`);
  } else {
    console.log(notes);
  }
}

if (process.argv[1] && process.argv[1].endsWith('store-release-notes.ts')) {
  main();
}

