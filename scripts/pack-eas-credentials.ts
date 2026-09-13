/**
 * Pack everything `eas build --local` needs into one base64 tarball.
 *
 * Why this exists
 * ---------------
 * `credentials.json` is a POINTER file, not a bundle. Its schema names the
 * files it depends on:
 *
 *   android: { keystore: { keystorePath } }
 *   ios:     { provisioningProfilePath, distributionCertificate: { path } }
 *
 * Copying only credentials.json into CI therefore leaves the build unable to
 * find the keystore, the .p12 and the .mobileprovision it refers to. This walks
 * the referenced paths and packs the whole set, so one secret is still enough.
 *
 * Usage
 * -----
 *   cd apps/mobile && npx eas credentials      # download credentials.json + files
 *   npx tsx scripts/pack-eas-credentials.ts > /tmp/eas-credentials.b64
 *
 * Redirect stdout straight into `gh secret set`. Progress goes to stderr, so the
 * output is nothing but the base64 payload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const PROJECT_DIR = path.join(ROOT, 'apps/mobile');
const CREDENTIALS_JSON = path.join(PROJECT_DIR, 'credentials.json');

interface IosTarget {
  provisioningProfilePath?: string;
  distributionCertificate?: { path?: string };
}

interface CredentialsJson {
  android?: { keystore?: { keystorePath?: string } };
  ios?: IosTarget | Record<string, IosTarget>;
}

/** Every project-relative path credentials.json points at. */
function collectReferencedPaths(credentials: CredentialsJson): string[] {
  const referenced: string[] = [];

  const keystorePath = credentials.android?.keystore?.keystorePath;
  if (keystorePath) referenced.push(keystorePath);

  const ios = credentials.ios;
  if (ios) {
    // Two shapes are valid: a single target, or a record keyed by bundle id.
    const targets: IosTarget[] =
      'provisioningProfilePath' in ios ? [ios] : Object.values(ios as Record<string, IosTarget>);

    for (const target of targets) {
      if (target.provisioningProfilePath) referenced.push(target.provisioningProfilePath);
      if (target.distributionCertificate?.path) referenced.push(target.distributionCertificate.path);
    }
  }

  return [...new Set(referenced)];
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function main(): void {
  if (!fs.existsSync(CREDENTIALS_JSON)) {
    fail(
      'apps/mobile/credentials.json not found. Run `npx eas credentials` in apps/mobile and choose ' +
        'the credentials.json download action, for iOS and for Android.',
    );
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_JSON, 'utf8')) as CredentialsJson;
  const referenced = collectReferencedPaths(credentials);

  if (referenced.length === 0) {
    fail('credentials.json references no credential files — it looks empty or hand-written.');
  }

  const missing = referenced.filter((rel) => !fs.existsSync(path.resolve(PROJECT_DIR, rel)));
  if (missing.length > 0) {
    fail(
      `credentials.json points at files that do not exist:\n  ${missing.join('\n  ')}\n` +
        'Re-run the credentials.json download action so they are written alongside it.',
    );
  }

  const files = ['credentials.json', ...referenced];
  console.error(`Packing ${files.length} files from apps/mobile:`);
  for (const file of files) console.error(`  ${file}`);

  const tar = spawnSync('tar', ['czf', '-', '-C', PROJECT_DIR, ...files], {
    maxBuffer: 64 * 1024 * 1024,
  });

  if (tar.error) fail(`could not run tar: ${tar.error.message}`);
  if (tar.status !== 0) fail(`tar exited ${tar.status}: ${tar.stderr?.toString() ?? ''}`);

  process.stdout.write(tar.stdout.toString('base64'));
  console.error('\nWrote the base64 payload to stdout.');
}

main();
