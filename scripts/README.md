# Repository Automation & Scripts (`scripts`)

## Overview
Repository automation and developer tooling directory containing CI/CD verification guards, bundle size and performance scorecard generators, Firebase emulator and QA database seeding routines, documentation and release compilers, and weekly autonomous maintenance agents.

## Interface
- Git & Diff Helpers: `getBaseRef`, `ensureBaseRef`, `getChangedFiles`, `getFileDiff`, `parseUnifiedDiff` (`_diff-base.ts`)
- Color Token Guard: `checkFile`, `run` (`check-hardcoded-colors.ts`)
- UI Strings & i18n Guard: `collectUsedMobileKeys`, `findMissingMobileKeys`, `checkMobileI18n`, `run` (`check-hardcoded-ui-strings.ts`)
- Architecture Seams Guard: `matchesGlob`, `parseSeamMap`, `findDeadEntries`, `findUnguardedSeams`, `formatWarning` (`seam-rules.ts`, `check-seams.ts`)
- Version Consistency Guard: `deriveVersion`, `resolveVersion`, `applyVersion`, `evaluateVersionConsistency` (`version-rules.ts`, `check-version.ts`)
- Corpus Compilers: `runCompile` (`compile-help.ts`, `compile-whats-new.ts`), `runDraft` (`draft-whats-new.ts`)
- Improvement Discovery: `discoverAssetImprovements`, `discoverBundleBudgetAnomalies`, `discoverDesignTokenDrift`, `generateDiscoveryReport` (`discover-improvements.ts`)
- Bundle Size Measurement: `runBundleMeasurement` (`measure-bundle.ts`), `measureMobileBundle`, `runCli` (`measure-mobile-bundle.ts`)
- Performance Scorecard: `parseLighthouseManifest`, `evaluateQualityChecks`, `composeScorecardMarkdown`, `syncWithGitHubIssue` (`generate-scorecard.ts`)
- Database Seeding: `seedEmulator` (`seed-emulator.ts`), `seed` (`seed-test-user-docs.ts`, `seed-qa.ts`, `seed-bible-study.ts`)
- GitHub Issue Sync: `fetchGitHubIssues`, `syncIssuesToDocs` (`sync-github-issues.ts`)
- [agent](./agent/README.md): Autonomous weekly maintenance runner for vector optimization and issue triage

## Invariants
- `deriveVersion`: Requires minor and patch numbers < 100 for `major*10000 + minor*100 + patch` encoding; `buildNumber` must not exceed `MAX_BUILD_NUMBER` (2,100,000,000) (`version-rules.ts`).
- `evaluateVersionConsistency`: Asserts `expo.version`, `expo.ios.buildNumber`, and `expo.android.versionCode` are never committed into `apps/mobile/app.json` (`version-rules.ts`).
- `check-hardcoded-colors`: Verifies added lines in git diff contain no raw hex colors, Tailwind palette utilities, or text-on-border misuse without `colour-token-ignore` marker (`check-hardcoded-colors.ts`).
- `check-hardcoded-ui-strings`: Ensures added JSX text and UI attributes use `t()` localization keys, and static mobile keys exist in phone locales (`check-hardcoded-ui-strings.ts`).
- `check-seams`: Ensures all paths and guards defined in `e2e/seams.json` match existing repository files (`seam-rules.ts`).
- `measure-bundle`: Enforces 350 KB Gzip entry JS budget and flags delta >= +5 KB as regression (`measure-bundle.ts`).
- `measure-mobile-bundle`: Enforces 16 MB raw Hermes bytecode and 8 MB raw assets budgets for mobile exports (`measure-mobile-bundle.ts`).
- `sync-github-issues`: Filters out pull requests to ensure only genuine issues are synced (`sync-github-issues.ts`).

## Side Effects
- Populates Firebase Auth and Firestore emulator collections (`seed-emulator.ts`).
- Writes comprehensive mock dataset to `qa-db` Firestore database (`seed-qa.ts`).
- Writes compiled release manifests to `src/generated/whats-new.json` and `apps/mobile/assets/whats-new.json` (`compile-whats-new.ts`).
- Writes compiled help manifest to `src/generated/help.json` (`compile-help.ts`).
- Writes scorecard to `dist/bundle-scorecard.json` and `.cache/bundle-baseline.json` (`measure-bundle.ts`).
- Updates `.cache/rolling-history.json` and syncs daily metrics scorecard to GitHub issue via `gh issue` CLI (`generate-scorecard.ts`).
- Fetches issues from GitHub API, writes `docs/issues.json` and `docs/issues-index.json` (`sync-github-issues.ts`).

## Verification
- Run: `npm test`
