# 0022. Auto trigger GitHub Issue on main branch CI failure

Date: 2026-09-14

## Status

Accepted

## Context

Failures on the `main` branch require prompt visibility for both human maintainers and automated agents. Without automated issue creation, broken builds on `main` can go unnoticed until subsequent branches or pull requests fail.

We evaluated two potential designs:
1. **Inline job within `ci.yml`**: An additional job running on failure (`if: failure() && github.ref == 'refs/heads/main'`). This would require granting `issues: write` permission to the main test suite workflow (`ci.yml`), which also runs on untrusted/arbitrary PR branches.
2. **Decoupled `workflow_run` workflow (`ci-failure-issue.yml`)**: Triggered only after the `CI` workflow completes on `main` with conclusion `failure`.

## Decision

We chose a decoupled workflow (`.github/workflows/ci-failure-issue.yml`) using `workflow_run`:
- **Permission Isolation**: Keeps `ci.yml` lean and read-only without granting elevated `issues: write` token permissions to test runners.
- **Deduplication**: When CI fails repeatedly across multiple commits, the workflow searches for an existing open issue titled `🚨 CI failure on main branch`. If an open issue exists, it appends a comment with the latest run and commit details rather than spamming duplicate issues.
- **Canonical Triage Labels**: Applies the standard triage label `needs-triage` alongside `bug` and `github_actions`, fitting the repository's triage lifecycle (`docs/agents/triage-labels.md`).
- **Human Resolution**: The issue is left open until a maintainer or agent resolves the failure and verifies it on `main`.

## Consequences

- If `CI` fails on `main`, an issue is immediately opened or updated with actionable run URLs and commit metadata.
- `workflow_run` triggers run on the default branch context, ensuring secure access to repository tokens.
