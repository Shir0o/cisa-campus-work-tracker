# AGENTS.md

Behavioral guidelines to maximize code quality, prevent regressions, and minimize context/token cost.

---

## 1. Think & Clarify Before Coding
- **State Assumptions & Tradeoffs**: Surface ambiguity early. Do not silently pick an implementation path if alternate approaches exist.
- **Cost & Token Efficiency**: Avoid unnecessary tool calls, large file dumps, or speculative iterations.

## 2. Simplicity First & Surgical Changes
- **Targeted Edits**: Touch only what is necessary to fulfill the request. Every changed line must trace directly to the user requirement.
- **No Over-Engineering**: Avoid speculative features, unnecessary abstractions, or unrequested configuration options.
- **No Mock Data**: Always wire real data from Firestore, props, or state. Never hardcode fake/mock data in component logic.
- **Clean Up Own Mess**: Remove only imports, variables, and code introduced or made unused by your changes. Do not touch pre-existing dead code.

## 3. Targeted Changelog Context & Tracking
- **Selective Reading**: Do NOT read the entire `CHANGELOG.md` file (which can be large). Check only recent entries, the `[Unreleased]` section, or search for sections relevant to the code being modified to prevent regressions.
- **Update After Completion**: Append a concise bullet point under `[Unreleased]` in `CHANGELOG.md` summarizing core changes added, modified, or fixed.

## 4. Test-Driven Development (TDD) & Quality
- **TDD First**: Follow Red → Green → Refactor. Write or update unit tests before writing implementation code.
- **Coverage & Ratcheting**: Enforce test coverage thresholds (e.g. in `vitest.config.ts`). Thresholds must never be lowered; only ratchet upwards as coverage improves.
- **Goal Verification**: Transform tasks into verifiable goals (e.g. reproducing a bug via test first, ensuring all unit tests pass after).

## 5. Pre-PR Gate
Before creating or pushing a PR, run local CI pipeline steps in order and fix all failures:

```bash
git fetch origin main && git rebase origin/main   # stay up-to-date and resolve conflicts
npm run typecheck                                  # tsc --noEmit
npm run lint                                       # eslint .
npm run test:coverage                              # vitest run --coverage
npm run build                                      # vite build + esbuild server
```

- **Fix, don't skip**: Do not push with failing lints, build errors, or test coverage drops.
- **Signature Verification**: Always match actual function signatures across callers when modifying utility functions.

## 6. Releases & the in-app "What changed" sheet (#546)

The app shows an authored sheet once per version — the repo half of that issue is
the build ritual, the app half is `RELEASES` + `ReleaseStore` + the `releaseShow`
gate (shared in `packages/core/src/releases.ts`, mirrored in `src/lib/releases.ts`
for the web and `apps/mobile/src/lib/releases.ts` for the phone).

Before an **EAS build** (`apps/mobile`), do both, in this order:
1. **Bump the version** — raise `apps/mobile/app.json` → `expo.version` to the
   next release number.
2. **Draft + author the notes** — run `npx tsx scripts/draft-release-notes.ts`
   (optionally `--since <date>` to widen the window), then edit the output into a
   new, newest-first entry at the top of `RELEASES` in all three files above with
   the SAME `version`, `date`, `roles`, and 3–4 plain sentence-case lines. Git
   subjects are not release notes: rewrite them as what a full-timer at 9am can
   now do.

Rules that hold the sheet together:
- **Once per version** — the last-seen version is the only thing stored; no badge, no history, no nav item.
- **A release with `lines: []` shows no sheet** — use that for a quiet release.
- **`roles` limits who sees it** — nobody is told about a screen they don't have.
- **Never during the on-campus window** — the phone passes `inWindow`; the desktop passes nothing.
