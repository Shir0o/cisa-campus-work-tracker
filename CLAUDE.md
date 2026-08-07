# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Acting

**Don't hide confusion. Surface tradeoffs. But don't stall on questions you can answer yourself.**

Before implementing:
- Make routine judgment calls yourself. State the assumption inline and keep going.
- Ask only when different readings would produce materially different work, or when the action is irreversible.
- If a simpler approach exists, say so. Push back when warranted.
- Name real tradeoffs and unknowns as you go - one sentence, then continue.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Changelog Context & Tracking

**Always prevent regression by checking the changelog before making changes, and always update the changelog after.**

Before starting a feature or bug fix, when it touches an area with recent churn:
- Check the `[Unreleased]` section and recent entries of [CHANGELOG.md](CHANGELOG.md) for context on recent PRs and changes. This helps prevent regression.
- Read it targeted (`head`, or `grep` for the files/features you're touching). Never read the whole file - it is 600+ lines and grows every PR.

After completing a feature or bug fix (always):
- Update the `[Unreleased]` section of `CHANGELOG.md` with a concise bullet point describing the change. Focus on the core functionality added, modified, or fixed.
- Keep changelog descriptions brief and distinct from full release notes.

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
  ```
  This mirrors `.github/workflows/ci.yml` - keep it in sync if CI changes. Fix failures; never push through them.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, and fewer redundant tool calls or subagent spawns.
