/**
 * Print the mobile app's version and build number for a release tag, and emit
 * them as `version` / `build_number` outputs when running in CI.
 *
 * The app config derives the same values from the same rules
 * (scripts/version-rules.ts) when Expo reads it, so this CLI no longer writes
 * anything. It exists so the release workflows can feed the store release-notes
 * steps without reading a committed version; there isn't one.
 *
 * Usage
 * -----
 *   npx tsx scripts/mobile-version.ts --tag v1.4.0
 *   GITHUB_REF_NAME=v1.4.0 npx tsx scripts/mobile-version.ts
 *   npx tsx scripts/mobile-version.ts        # nearest git tag, then the package
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveVersion, resolveVersion } from './version-rules';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function nearestTag(): string | null {
  try {
    return execSync('git describe --tags --abbrev=0', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function packageVersion(): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/mobile/package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

function main(): void {
  const resolved = resolveVersion({
    explicitTag: argValue('--tag') ?? process.env.GITHUB_REF_NAME,
    nearestTag: nearestTag(),
    packageVersion: packageVersion(),
  });
  const { version, buildNumber } = deriveVersion(resolved);

  console.log(`Source                ${resolved}`);
  console.log(`Version               ${version}`);
  console.log(`Build number          ${buildNumber}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nbuild_number=${buildNumber}\n`);
  }
}

main();
