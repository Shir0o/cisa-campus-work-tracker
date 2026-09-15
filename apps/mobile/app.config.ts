// Expo's config loader transpiles this file with sucrase and then `require`s
// it, so an imported `.ts` module needs sucrase's require hook registered
// first. sucrase is a direct dependency of @expo/config, which loads this file.
import 'sucrase/register';
import { execSync } from 'node:child_process';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import packageJson from './package.json';
import {
  applyVersion,
  deriveVersion,
  resolveVersion,
  type ExpoAppConfig,
} from '../../scripts/version-rules';

/**
 * The mobile app's version and build numbers are never committed. They are
 * derived here, when Expo/EAS evaluates the app config, from the release tag
 * (explicit via RELEASE_TAG, else the nearest git tag, else the package
 * version). See ADR 0025 and docs/adr/0020-mobile-release-automation.md.
 */

function nearestTag(): string | null {
  try {
    return execSync('git describe --tags --abbrev=0', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // No git history (a tarball, a shallow clone): fall back to the package.
    return null;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const resolved = resolveVersion({
    explicitTag: process.env.RELEASE_TAG,
    nearestTag: nearestTag(),
    packageVersion: packageJson.version,
  });
  const derived = deriveVersion(resolved);

  // ConfigContext hands us the unwrapped Expo config; applyVersion works on
  // the file shape (`{ expo: ... }`), so wrap, patch, and unwrap.
  const patched = applyVersion({ expo: config as ExpoAppConfig['expo'] }, derived);
  return patched.expo as unknown as ExpoConfig;
};
