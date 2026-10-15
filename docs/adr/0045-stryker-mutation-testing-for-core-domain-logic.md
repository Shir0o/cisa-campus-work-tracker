# 0045: Stryker Mutation Testing for Core Domain Logic

## Status

Accepted

## Context

The repository enforces strong code-coverage thresholds in `vitest.config.ts` (lines >91.5%, branches >78.5%, functions >86%, statements >89.5%) along with strict ratcheting rules. However, code coverage measures only execution traversal: lines executed by a test suite can still lack behavioral assertions or fail to detect subtle boundary faults, sign inversions, or dropped conditions (the "assertion-free coverage" pitfall).

Critical domain logic in this product includes:
1. **Bible Study Markdown parsing and outline extraction** (`src/lib/bibleStudy.ts`): Governing principle "The author decides, the page obeys" (ADR 0013, ADR 0014). Minor regex or condition mutations can silently drop blocks or misclassify Scripture references.
2. **Contact Deduplication and Combine Planning** (`src/lib/duplicateContact.ts`, `src/lib/combineContactsPlan.ts`): Generates destructive database transformations and merge plans across ties, carers, and founders (ADR 0026, ADR 0038).
3. **Role Gating and Permissions** (`src/lib/permissions.ts`): Determines data boundary visibility between Full-timers, Trainees, and Viewers.
4. **Attention Feed and Asks Lifecycle** (`src/lib/attention.ts`, `src/lib/asks.ts`): Computes time-decay windows, "to work through" counts, and overdue follow-up escalations.

To ensure tests truly assert business invariants rather than merely touching code paths, mutation testing evaluates test strength by programmatically introducing synthetic faults (mutants) and verifying the test suite fails ("kills" the mutant).

## Decision

1. **Adopt Stryker Mutator (`@stryker-mutator/core` with `@stryker-mutator/vitest-runner`)**:
   Use StrykerJS as the project's mutation testing engine, integrating directly with Vitest via `vitest.config.ts`.
2. **Target High-Value Core Logic Modules**:
   Scope mutation targets via `stryker.config.json` `mutate` patterns:
   - `src/lib/bibleStudy.ts`
   - `src/lib/combineContactsPlan.ts`
   - `src/lib/duplicateContact.ts`
   - `src/lib/permissions.ts`
   - `src/lib/attention.ts`
   - `src/lib/asks.ts`
3. **Execution Cadence**:
   - Provide an on-demand developer script: `npm run test:mutation`.
   - Mutation testing requires Node >= 22 (matching repository standard Node 24 for CI jobs).
   - Because mutation analysis introduces significant CPU runtime (~minutes for large AST sweeps), it remains an on-demand verification tool and advisory/scheduled workflow rather than a mandatory block on quick PR loops.
4. **Reports and Artifacts**:
   - Output HTML reports to `reports/mutation/mutation.html` alongside console clear-text summaries.
   - Ignore `.stryker-tmp/` and `reports/` in `.gitignore`.

## Consequences

- **Quality & Defect Prevention**: Uncovers gaps where tests exercise code without checking outputs or state transitions.
- **Controlled Cost & Runtime**: Constraining `mutate` globs to pure domain logic prevents combinatorial explosion and excessive token/CI costs.
- **Maintainability**: Stryker configuration is versioned in `stryker.config.json` and respects existing Vitest setup and path aliases.
