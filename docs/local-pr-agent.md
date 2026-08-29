# Running PR Agent locally

The GitHub Actions PR Agent workflow has been removed. Run the same style of
review locally before opening or updating a pull request.

## Option 1: review a draft PR (recommended)

1. Push your branch and open a draft PR (or use an existing PR).
2. Run PR Agent against that PR URL with Docker:

```bash
docker run --rm -it \
  -e GITHUB_TOKEN="$GITHUB_TOKEN" \
  -e GOOGLE_AI_STUDIO__GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e CONFIG__MODEL="gemini/gemini-2.5-flash" \
  -e CONFIG__FALLBACK_MODELS='["gemini/gemini-2.5-flash-lite"]' \
  codiumai/pr-agent:latest \
  --pr_url https://github.com/Shir0o/cisa-campus-work-tracker/pull/512
```

3. Consider the suggestions, update the branch, and push again.

## Option 2: review a local branch

If the installed PR Agent version supports direct branch review, use:

```bash
docker run --rm -it \
  -e GITHUB_TOKEN="$GITHUB_TOKEN" \
  -e GOOGLE_AI_STUDIO__GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e CONFIG__MODEL="gemini/gemini-2.5-flash" \
  -e CONFIG__FALLBACK_MODELS='["gemini/gemini-2.5-flash-lite"]' \
  codiumai/pr-agent:latest \
  --project_url https://github.com/Shir0o/cisa-campus-work-tracker \
  --branch feat/i18n-contact-coordination-ci-guard
```

Useful commands: `review`, `improve`, `describe`.

## Environment variables

The local run needs the same secrets that the GitHub Action used:

- `GITHUB_TOKEN` — a GitHub token with repo access.
- `GEMINI_API_KEY` — Google AI Studio Gemini API key.
- `CONFIG__MODEL` / `CONFIG__FALLBACK_MODELS` — model selection (optional).
