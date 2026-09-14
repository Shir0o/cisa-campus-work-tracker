/**
 * Derive the mobile app's version and build number from a release tag, and
 * write them into `apps/mobile/app.json`.
 *
 * Why this exists
 * ---------------
 * `cli.appVersionSource` is "local", so EAS reads versions from `app.json`, and
 * `eas build` has no `--build-number` flag (its full flag list is: platform,
 * skip-credentials-check, skip-project-configuration, profile, local, output,
 * wait, clear-cache, auto-submit, auto-submit-with-profile, what-to-test,
 * resource-class, message, build-logger-level, freeze-credentials,
 * refresh-ad-hoc-provisioning-profile, verbose-logs). The build number must
 * therefore be written into `app.json` *before* the build runs — in CI and on a
 * developer's machine alike. This script is the single derivation both use, so
 * a CI release and a local `eas build` can never disagree and mint the same
 * build number twice.
 *
 * Usage
 * -----
 *   npx tsx scripts/mobile-version.ts --tag v1.4.0
 *   npx tsx scripts/mobile-version.ts --tag v1.4.0 --dry-run
 *   GITHUB_REF_NAME=v1.4.0 npx tsx scripts/mobile-version.ts
 *   npx tsx scripts/mobile-version.ts        # falls back to the newest git tag
 *
 * The tag is authoritative: `v1.4.0` and `v1.4.0-rc.1` both yield version
 * `1.4.0` and build number 10400.
 *
 * When GITHUB_OUTPUT is set the script also emits `version` and `build_number`
 * for downstream workflow steps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const APP_JSON_PATH = path.join(ROOT, 'apps/mobile/app.json');

/** Android's maximum versionCode; also the point where the encoding overflows. */
const MAX_VERSION_CODE = 2_100_000_000;

interface ParsedTag {
  major: number;
  minor: number;
  patch: number;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function resolveTag(): string {
  const explicit = argValue('--tag');
  if (explicit) return explicit;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'No --tag given, GITHUB_REF_NAME is unset, and no reachable git tag exists. Pass --tag vX.Y.Z.',
    );
  }
}

function parseTag(tag: string): ParsedTag {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag.trim());
  if (match === null) {
    throw new Error(`Cannot parse a major.minor.patch version out of the tag '${tag}'.`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * `major*10000 + minor*100 + patch`. This is injective only while `minor` and
 * `patch` stay below 100, so the bounds are checked rather than assumed —
 * otherwise 1.100.0 and 2.0.0 would collide on the same build number.
 */
function toBuildNumber({ major, minor, patch }: ParsedTag): number {
  if (minor > 99 || patch > 99) {
    throw new Error(
      `Version component out of range: minor=${minor}, patch=${patch}. ` +
        'The major*10000 + minor*100 + patch encoding requires minor and patch to be below 100.',
    );
  }
  const code = major * 10000 + minor * 100 + patch;
  if (code > MAX_VERSION_CODE) {
    throw new Error(`Derived build number ${code} exceeds Android's maximum of ${MAX_VERSION_CODE}.`);
  }
  return code;
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const tag = resolveTag();
  const parsed = parseTag(tag);
  const version = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  const buildNumber = toBuildNumber(parsed);

  const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8')) as {
    expo: {
      version?: string;
      ios?: Record<string, unknown>;
      android?: Record<string, unknown>;
    };
  };

  const previousVersion = appJson.expo.version;
  const previousIosBuildNumber = appJson.expo.ios?.buildNumber;
  const previousAndroidVersionCode = appJson.expo.android?.versionCode;

  appJson.expo.version = version;
  appJson.expo.ios = { ...appJson.expo.ios, buildNumber: String(buildNumber) };
  appJson.expo.android = { ...appJson.expo.android, versionCode: buildNumber };

  console.log(`Tag                  ${tag}`);
  console.log(`Version              ${previousVersion ?? '(unset)'} -> ${version}`);
  console.log(`iOS buildNumber      ${previousIosBuildNumber ?? '(unset)'} -> ${buildNumber}`);
  console.log(`Android versionCode  ${previousAndroidVersionCode ?? '(unset)'} -> ${buildNumber}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nbuild_number=${buildNumber}\n`);
  }

  if (dryRun) {
    console.log('--dry-run: app.json not written.');
    return;
  }

  fs.writeFileSync(APP_JSON_PATH, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, APP_JSON_PATH)}`);
}

main();
