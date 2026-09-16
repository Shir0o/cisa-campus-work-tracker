# AFK Issue Loop — install & usage

The `/afk-issue-loop` command runs the AFK issue loop: it autonomously triages and
implements GitHub issues in this repo (triage → implement → PR → merge → repeat).

## Why `/afk-issue-loop` wasn't showing up

opencode loads two different things:

- **Skills** — auto-loaded from `~/.claude/skills/<name>/SKILL.md` and `~/.agents/skills/<name>/SKILL.md`. Skills are *instructions the model can use*, not slash commands.
- **Commands** — files in a `command/` directory. These are what the `/` menu lists.

The skill (`~/.claude/skills/afk-issue-loop/SKILL.md`) was installed all along; the
`/afk-issue-loop` command was not. This directory adds the command.

## Install

The command file lives in two places; either alone is enough.

| Scope | Path | Effect |
|---|---|---|
| Global | `~/.config/opencode/command/afk-issue-loop.md` | `/afk-issue-loop` available in every repo |
| Project | `<repo>/.opencode/command/afk-issue-loop.md` | available in this repo only |

To install for a repo:

```
mkdir -p .opencode/command
cp ~/.config/opencode/command/afk-issue-loop.md .opencode/command/
```

The command body references the `afk-issue-loop` skill, which opencode auto-loads
from `~/.claude/skills/afk-issue-loop/SKILL.md` (or `~/.agents/skills/...`). If you
copied the skill elsewhere, point `skills.paths` at it in `opencode.json`:

```json
{
  "skills": { "paths": ["/abs/path/to/skills"] }
}
```

## Use

- `/afk-issue-loop` — run the loop until the queue is empty.
- `/afk-issue-loop stop after issue N` — run with a stop condition.

After installing or editing a command, **quit and restart opencode** — config is
loaded once at startup and not hot-reloaded.

## Prerequisites

- `gh` CLI authenticated for this repo.
- `node_modules` installed (`npm ci`).
- The skill's own prerequisites (worktree setup, merge policy) are handled by the
  loop itself per `SKILL.md` Phase 0.