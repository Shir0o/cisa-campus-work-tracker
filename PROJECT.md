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
  npm run typecheck && npm run lint && npm run test:coverage && npm run build
  This mirrors `.github/workflows/ci.yml` - keep it in sync if CI changes. Fix failures; never push through them.
---
**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, and fewer redundant tool calls or subagent spawns.
