/**
 * Pure rules for deriving the mobile app's user-facing version and both
 * developer-facing build numbers from a release tag.
 *
 * This module is intentionally dependency-free: Expo evaluates it when the
 * mobile app config is read (at build time), and the repo's scripts and tests
 * import it too. Nothing here may touch the filesystem, the network, a clock,
 * or any application dependency; packages/core is too heavy to import here.
 */

/** Android's maximum versionCode; also where the encoding overflows. */
export const MAX_BUILD_NUMBER = 2_100_000_000;

export interface DerivedVersion {
  version: string;
  buildNumber: number;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

function readComponents(input: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(input.trim());
  if (match === null) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function parseVersion(input: string): ParsedVersion {
  const parsed = readComponents(input);
  if (parsed === null) {
    throw new Error(`Cannot parse a major.minor.patch version out of '${input}'.`);
  }
  return parsed;
}

export function deriveVersion(input: string): DerivedVersion {
  const { major, minor, patch } = parseVersion(input);
  if (minor > 99 || patch > 99) {
    throw new Error(
      `Version component out of range in '${input}': minor=${minor}, patch=${patch}. ` +
        'The major*10000 + minor*100 + patch encoding requires minor and patch below 100.',
    );
  }
  const buildNumber = major * 10000 + minor * 100 + patch;
  if (buildNumber > MAX_BUILD_NUMBER) {
    throw new Error(
      `Build number ${buildNumber} derived from '${input}' exceeds Android's maximum of ${MAX_BUILD_NUMBER}.`,
    );
  }
  return { version: `${major}.${minor}.${patch}`, buildNumber };
}

export interface VersionSources {
  /** A tag supplied explicitly, e.g. by a release workflow. */
  explicitTag?: string | null;
  /** The nearest reachable git tag, e.g. from `git describe`. */
  nearestTag?: string | null;
  /** The mobile package's committed version, a tag-less fallback. */
  packageVersion?: string | null;
}

/**
 * Pick the version to derive from, in priority order: an explicit tag, the
 * nearest git tag, then the package version. Blank values are ignored.
 */
export function resolveVersion({ explicitTag, nearestTag, packageVersion }: VersionSources): string {
  const chosen = [explicitTag, nearestTag, packageVersion].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim() !== "",
  );
  if (chosen === undefined) {
    throw new Error(
      "No version available: pass an explicit tag, check out a tagged commit, or set the mobile package version.",
    );
  }
  return chosen.trim();
}

/** The slice of Expo's app config this module reads and writes. */
export interface ExpoAppConfig {
  [key: string]: unknown;
  expo: {
    [key: string]: unknown;
    version?: string;
    ios?: { [key: string]: unknown; buildNumber?: string };
    android?: { [key: string]: unknown; versionCode?: number };
  };
}

/** An app config that is guaranteed to carry all three derived values. */
export type VersionedAppConfig<T extends ExpoAppConfig = ExpoAppConfig> = T & {
  expo: T['expo'] & {
    version: string;
    ios: Record<string, unknown> & { buildNumber: string };
    android: Record<string, unknown> & { versionCode: number };
  };
};

/**
 * Return a copy of the app config carrying the derived version and build
 * numbers. The input is never mutated; existing platform keys are preserved.
 */
export function applyVersion<T extends ExpoAppConfig>(
  baseConfig: T,
  derived: DerivedVersion,
): VersionedAppConfig<T> {
  const { expo } = baseConfig;
  return {
    ...baseConfig,
    expo: {
      ...expo,
      version: derived.version,
      ios: { ...(expo.ios ?? {}), buildNumber: String(derived.buildNumber) },
      android: { ...(expo.android ?? {}), versionCode: derived.buildNumber },
    },
  } as VersionedAppConfig<T>;
}

export interface VersionConsistencyInput {
  staticConfig: ExpoAppConfig;
}

export interface VersionConsistencyResult {
  failures: string[];
}

/**
 * Decide whether the repository's committed version-like values are consistent
 * with the derived-only rule.
 *
 * Failures break the invariant (a version literal has been committed back).
 */
export function evaluateVersionConsistency({
  staticConfig,
}: VersionConsistencyInput): VersionConsistencyResult {
  const failures: string[] = [];
  const expo = staticConfig?.expo ?? {};

  if (expo.version !== undefined) {
    failures.push(
      `expo.version must not be committed (found '${expo.version}'); it is derived from the release tag.`,
    );
  }
  if (expo.ios?.buildNumber !== undefined) {
    failures.push(
      `expo.ios.buildNumber must not be committed (found '${expo.ios.buildNumber}'); it is derived from the release tag.`,
    );
  }
  if (expo.android?.versionCode !== undefined) {
    failures.push(
      `expo.android.versionCode must not be committed (found '${expo.android.versionCode}'); it is derived from the release tag.`,
    );
  }

  return { failures };
}
