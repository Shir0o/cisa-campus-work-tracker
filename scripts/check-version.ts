/**
 * Version-consistency guard (#1020).
 *
 * The mobile app's version and build numbers are derived at config-evaluation
 * time, never committed. This guard fails the build if a version literal is
 * committed back into the static app config, and warns (never fails) when the
 * newest `content/whats-new` manifest lags the newest release tag.
 * See docs/adr/0025-derived-mobile-app-version.md.
 *
 * Mirrors the regression-guard pattern of check-hardcoded-colors.ts /
 * check-hardcoded-ui-strings.ts: a thin CLI over pure logic in
 * scripts/version-rules.ts, with the logic unit-tested from src/test/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateVersionConsistency } from './version-rules';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = path.join(ROOT, 'apps/mobile/app.json');
const WHATS_NEW_DIR = path.join(ROOT, 'content/whats-new');

function readStaticConfig(): unknown {
  return JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
}

function readManifestVersions(): string[] {
  let files: string[];
  try {
    files = fs.readdirSync(WHATS_NEW_DIR);
  } catch {
    return [];
  }
  return files
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(WHATS_NEW_DIR, file), 'utf8');
      const match = /^version:\s*(.+)$/m.exec(raw);
      return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
    })
    .filter(Boolean);
}

/** The newest release tag, by version sort; best-effort when tags are absent. */
function newestTag(): string | null {
  const read = (): string | null => {
    try {
      const tags = execSync('git tag --sort=-v:refname', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split('\n')
        .map((tag) => tag.trim())
        .filter((tag) => /^v?\d+\.\d+\.\d+/.test(tag));
      return tags[0] ?? null;
    } catch {
      return null;
    }
  };

  const found = read();
  if (found !== null) return found;
  try {
    execSync('git fetch --tags --quiet', { stdio: 'ignore' });
  } catch {
    // Offline or no remote: the warning is best-effort, the failure is not.
  }
  return read();
}

function main(): void {
  const { failures, warnings } = evaluateVersionConsistency({
    staticConfig: readStaticConfig(),
    manifestVersions: readManifestVersions(),
    latestTag: newestTag(),
  });

  for (const warning of warnings) {
    console.warn(`::warning::${warning}`);
  }
  for (const failure of failures) {
    console.error(`::error::${failure}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
  console.log('Version consistency OK: nothing version-like is committed.');
}

main();
