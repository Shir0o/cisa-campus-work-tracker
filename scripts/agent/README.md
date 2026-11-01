# Autonomous Maintenance Agent (`scripts/agent`)

## Overview
Autonomous weekly maintenance runner for discovering, applying lossless vector asset optimizations, executing verification gates, creating automated pull requests, and syncing review candidates to GitHub issues.

## Interface
- `AppliedImprovement`: Interface representing an applied codebase improvement (`runner.ts`)
- `applyAssetOptimization(filePath)`: Optimizes SVGs using SVGO while preserving viewboxes (`runner.ts`)
- `runVerificationGate()`: Executes verification gate (`typecheck`, `lint`, `test:coverage`, `build`) (`runner.ts`)
- `generatePrSummary(improvements)`: Generates structured markdown pull request summary (`runner.ts`)
- `generateIssueSummary(candidate)`: Generates issue body for human triage (`runner.ts`)
- `syncMicroImprovementIssue(candidate)`: Files GitHub issue for candidates requiring review (`runner.ts`)
- `executeMaintenanceLoop()`: Main weekly loop executing optimizations and creating PRs (`runner.ts`)

## Invariants
- Vector fidelity: Preserves SVG viewBox and dimensions (`cleanupIds: false`, `mergePaths: false`); only overwrites target file if bytes saved > 0 (`runner.ts`).
- Verification gate: Executes `npm run typecheck`, `npm run lint`, `npm run test:coverage`, and `npm run build` sequentially; returns false if any command fails (`runner.ts`).
- Safety rollback: Reverts changes (`git checkout -- .`) and aborts execution if verification gate fails, preventing broken PRs (`runner.ts`).
- Triage separation: Auto-merges only deterministic asset optimization candidates (`category === 'asset-optimization' && canAutoMerge`); routes non-mergeable candidates to GitHub issues labeled `maintenance` and `ready-for-agent` (`runner.ts`).

## Side Effects
- Modifies SVG asset files in place on disk (`runner.ts`).
- Executes child processes for verification gates (`runner.ts`).
- Executes `gh issue` CLI commands and writes `.cache/micro-improvement-issue.md` (`runner.ts`).
- Writes `.cache/pr-body.md`, creates git branches (`agent/weekly-maintenance-<date>`), commits changes, pushes to remote origin, and opens pull requests via `gh pr create` (`runner.ts`).

## Verification
- Run: `npm test`
