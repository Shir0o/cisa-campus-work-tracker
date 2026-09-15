# 0025. The mobile app version is derived from the tag at config evaluation

Date: 2026-09-15

## Status

Accepted

## Context

ADR 0020 made the release tag the single source of truth and had
`scripts/mobile-version.ts` overwrite `expo.version`, `expo.ios.buildNumber`, and
`expo.android.versionCode` in `apps/mobile/app.json` before each build. That write
was never committed, so the committed `app.json` kept a stale literal (`1.0.1`
while the tags had reached `v1.4.2`). Because `cli.appVersionSource` is `local`
and `eas build` has no `--build-number` flag, a local build that skipped the
version script shipped `1.0.1`; the store rejected it only after a full build.
The committed value was indistinguishable from a real one, so the release guide
carried a warning against its own repository (issue #1040).

Three mechanisms were considered and rejected:

- **release-please's `expo` release type** would keep `app.json` honest, but its
  updater only rewrites build numbers when those keys already exist, uses a
  different encoding, and would reintroduce a committed literal.
- **An EAS build lifecycle hook** runs inside the build job, after the project
  has been prepared and its version resolved, so it cannot protect what EAS
  already read.
- **A preflight in the release workflows** guards CI, which already ran the
  version script; it does nothing for the local `eas build` the guard exists for.

## Decision

1. **Nothing version-like is committed.** `app.json` carries no `expo.version`,
   no `expo.ios.buildNumber`, and no `expo.android.versionCode`.
2. **The dynamic app config derives them when Expo evaluates it.** EAS reads the
   evaluated config, so `eas build`, `eas build --local`, and `expo prebuild` all
   see the derived values, with no step anyone can forget. Resolution order: an
   explicit `RELEASE_TAG` (the release workflows pass the tag), else the nearest
   reachable git tag, else `apps/mobile/package.json`.
3. **One dependency-free module owns every rule.**
   [`scripts/version-rules.ts`](../../scripts/version-rules.ts) exports
   `resolveVersion`, `deriveVersion`, `applyVersion`, and
   `evaluateVersionConsistency`. The encoding stays
   `major*10000 + minor*100 + patch`, with explicit bounds and Android's ceiling.
   The core package is deliberately not used: its barrel drags in Firebase and
   React Native, and this module is evaluated at build-config time.
4. **A guard keeps the invariant and surfaces notes lag.**
   [`scripts/check-version.ts`](../../scripts/check-version.ts) fails when a
   version literal reappears in `app.json`, and warns, never fails, when the
   newest `content/whats-new` manifest is behind the newest tag.

## Consequences

### Positive

- A local build cannot ship a stale version; the trap is gone rather than
  documented.
- The encoding and resolution rules exist once, and are unit-tested without Expo
  or EAS.
- The app config's version is always the tag's.

### Negative

- The mobile app now has two committed config files (`app.json` plus
  `app.config.ts`), and the dynamic config imports a TypeScript module, so it
  registers `sucrase/register` (a dependency of `@expo/config`) before importing.
  `sucrase` is declared in the mobile package to make that explicit.
- `scripts/mobile-version.ts` no longer writes anything; it only reports the
  version and build number for the notes steps.

### Reversibility

Easy: the dynamic config, the module, and the guard are each removable in one
commit, and a committed `version` can be restored.

## References

- Spec: [#1040](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1040)
- Supersedes the "Known wart" in [`RELEASING.md`](../../RELEASING.md) and
  resolves the "Known conflict" in
  [ADR 0020](0020-mobile-release-automation.md)
