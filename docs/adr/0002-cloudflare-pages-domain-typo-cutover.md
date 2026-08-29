# 0002: Recreate Cloudflare Pages projects to fix the `traker` → `tracker` typo in deployment domains

## Status
Accepted

## Context
The GitHub repo, and the two Cloudflare Pages projects and their default `*.pages.dev` domains derived from it, carried the misspelling `traker` (`cisa-campus-work-traker.pages.dev` and `cisa-campus-work-traker-qa.pages.dev`). The product name was always correctly spelled "CISA Campus Work Tracker"; the misspelling was a repo-name artifact that leaked into deployment URLs, Firebase Auth Authorized domains, the Google OAuth redirect URI, Twilio/GroupMe webhook targets, and EAS envs. Cloudflare Pages cannot rename a project — the default domain is bound to the project name and dies with it.

## Decision
1. Rename the GitHub repo `Shir0o/cisa-campus-work-traker` → `cisa-campus-work-tracker` (GitHub auto-redirects all old URLs; the Pages GitHub connection persists by repo identity).
2. Recreate the Cloudflare Pages projects as `cisa-campus-work-tracker` and `cisa-campus-work-tracker-qa` with identical build settings and env vars (documented in `CLOUDFLARE_DEPLOYMENT.md`); verify the new domains; then delete the old projects.
3. Update Firebase Auth Authorized domains, the Google OAuth `__/auth/handler` redirect URI, Twilio/GroupMe webhook targets, and any EAS remote env vars to the new domains.

## Consequences
- `cisa-campus-work-traker.pages.dev` and `cisa-campus-work-traker-qa.pages.dev` are permanently dead. Do NOT re-add them to Firebase Authorized domains, OAuth redirect URIs, or webhook targets — sign-in and webhooks will break.
- The cutover is zero-downtime: new projects deploy and are verified before the old ones are deleted; the old domain dies only at deletion.
- Chosen over keeping the misspelled domains (no production risk, but a permanent misspelling in URLs the team types every day) — a deliberate, coordinated production cutover for cosmetic correctness.
