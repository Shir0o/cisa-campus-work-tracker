#!/usr/bin/env bash
# Copy gitignored local secrets from the main repo checkout into the current
# git worktree, so E2E/dev tooling works in a fresh worktree without manually
# recreating them.
#
# Wired to the Claude Code SessionStart hook (see .claude/settings.json).
# Idempotent: only copies a file if it is missing in this worktree, and is a
# no-op when run from the main checkout or when the source file doesn't exist.
set -uo pipefail

common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 0
case "$common_dir" in
  /*) ;;                       # already absolute
  *) common_dir="$(pwd)/$common_dir" ;;
esac
main_root="$(cd "$(dirname "$common_dir")" 2>/dev/null && pwd)" || exit 0
current_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

# In the main checkout already — nothing to sync.
[ "$main_root" = "$current_root" ] && exit 0

SECRET_FILES=(".env" "e2e/.test-credentials.json")
for f in "${SECRET_FILES[@]}"; do
  src="$main_root/$f"
  dst="$current_root/$f"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "[sync-worktree-secrets] copied $f from main checkout into worktree"
  fi
done
exit 0
