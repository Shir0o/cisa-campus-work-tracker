#!/usr/bin/env bash
# Copy gitignored local files from the main repo checkout into the current
# git worktree, so E2E/dev tooling and Claude's project instructions work in a
# fresh worktree without manually recreating them.
#
# Wired to the Claude Code SessionStart hook (see .claude/settings.json).
# A no-op when run from the main checkout or when a source file doesn't exist.
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

# Secrets: copy only if missing, so a worktree-local edit is never clobbered.
SECRET_FILES=(".env" "e2e/.test-credentials.json")
for f in "${SECRET_FILES[@]}"; do
  src="$main_root/$f"
  dst="$current_root/$f"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    mkdir -p "$(dirname "$dst")"
    if cp "$src" "$dst"; then
      echo "[sync-worktree-secrets] copied $f from main checkout into worktree"
    fi
  fi
done

# Project instructions: always mirror so the worktree follows the latest CLAUDE.md.
MIRROR_FILES=("CLAUDE.md")
for f in "${MIRROR_FILES[@]}"; do
  src="$main_root/$f"
  dst="$current_root/$f"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    if cp "$src" "$dst"; then
      echo "[sync-worktree-secrets] synced $f from main checkout into worktree"
      # Keep it ignored locally so it doesn't show as untracked / get committed on
      # branches whose .gitignore predates the CLAUDE.md entry. Repo-local exclude,
      # no tracked file touched.
      exclude_file="$(git rev-parse --git-path info/exclude 2>/dev/null)"
      if [ -n "$exclude_file" ]; then
        mkdir -p "$(dirname "$exclude_file")"
        grep -qxF "$f" "$exclude_file" 2>/dev/null || echo "$f" >> "$exclude_file"
      fi
    fi
  fi
done
exit 0
