# Project-Specific Rules

<!-- Repo-specific agent instructions. The rollout script never touches this file. -->

<!-- ── Migrated from CLAUDE.md ── -->

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.
## 1. Think Before Acting
**Don't hide confusion. Surface tradeoffs. But don't stall on questions you can answer yourself.**
- Make routine judgment calls yourself. State the assumption inline and keep going.
- Ask only when different readings would produce materially different work, or when the action is irreversible.
- Name real tradeoffs and unknowns as you go - one sentence, then continue.

## 6. Testing Policy
- **TDD (Test-Driven Development)**: Mandatory for logic, data, and permissions code, and for all bug fixes. Write a failing test first, then implement. Red → Green → Refactor.
- **UI-only changes**: Pure styling/copy/markup changes need tests only where behavior is actually assertable - don't write hollow snapshot tests just to satisfy this policy.
- **Multi-step features**: Invoke the `tdd` skill so the red-green-refactor loop is followed consistently rather than from memory.
- **Unit Tests**: Coverage thresholds are enforced in `vitest.config.ts`.
- **Ratcheting**: Thresholds must never be lowered; they should only go up as coverage improves.
- **New Code**: All new features and bug fixes must ship with matching unit tests.
## 7. Cost Discipline
**Minimize tokens and round-trips without sacrificing correctness.**
- **Subagents**: Delegate to a subagent only for large tasks that are genuinely independent and parallelizable, such as a wide multi-file investigation. Do not delegate work you can finish yourself in a handful of tool calls, and do not use subagents to verify or double-check your own work. If one subagent can complete the task, use one rather than several, and keep spawn counts low.
- **Tool calls**: Batch independent tool calls into a single turn instead of sequencing them. Read targeted ranges instead of whole files when you know what you need. Don't re-read a file just to confirm an edit landed - Edit/Write already error on failure. Don't re-verify something you've already verified.
- **Verification scope**: While iterating, run only the checks the change can actually break - a doc-only change needs no typecheck/lint/test/build at all. Before pushing a PR, run the full gate once, in order:
  ```bash
  git fetch origin main && git rebase origin/main
  npm run typecheck && npm run lint && npm run build
  Offload full test runs and coverage to GitHub CI. Fix static failures; never push through them.
---
**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, and fewer redundant tool calls or subagent spawns.
---
## Agent skills

### Issue tracker

Issues live in GitHub Issues for Shir0o/cisa-campus-work-tracker, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: label strings equal the canonical role names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## 9. Local toolchain (check this before debugging the harness)

Two tool versions are load-bearing. Getting either wrong surfaces as an
unrelated, confusing failure that looks like a bug in the code under test:

- **Node 24** — pinned in `.nvmrc` and in `engines`. Web tooling (vitest +
  jsdom) dies on Node 20 with `webidl.util.markAsUncloneable is not a function`
  from `undici`, which reads like a broken test. CI runs the web job on Node 24
  (`.github/workflows/ci.yml`). Run `nvm use` (or `fnm use`) before
  `npm test` / `npx vitest`.
- **JDK 21** — the Firebase emulator refuses to start under JDK 17 with
  `firebase-tools no longer supports Java version before 21`. Set `JAVA_HOME`
  before `npm run test:e2e:emulator` or
  `npx firebase-tools emulators:start …`:
  `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.

`apps/mobile` (Node 20) and `firebase-functions` (Node 22) have their own
lockfiles and are unaffected.
