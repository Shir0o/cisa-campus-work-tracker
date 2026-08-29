# 0002: Recreate Cloudflare Pages projects to fix the `traker` → `tracker` typo in deployment domains

## Status
Accepted

## Context
The GitHub repo, and the two Cloudflare Pages projects and their default `*.pages.dev` domains derived from it, carried the misspelling `traker` (`cisa-campus-work-traker.pages.dev` and `cisa-campus-work-traker-qa.pages.dev`). The product name was always correctly spelled "CISA Campus Work Tracker"; the misspelling was a repo-name artifact that leaked into deployment URLs, Firebase Auth Authorized domains, the Google OAuth redirect URI, Twilio/GroupMe webhook targets, and EAS envs. Cloudflare Pages cannot rename a project — the default domain is bound to the project name and dies with it.

## Decision
1. Rename the GitHub repo `Shir0o/cisa-campus-work-traker` → `cisa-campus-work-tracker` (GitHub auto-redirects all old URLs; the Pages GitHub connection persists by repo identity).
2. Recreate the Cloudflare Pages projects as `cisa-campus-work-tracker` and `cisa-campus-work-tracker-qa` with identical build settings and env vars (documented in `CLOUDFLARE_DEPLOYMENT.md`); verify the new domains. The old projects are retained solely as **308-redirect shells** (`/* https://cisa-campus-work-tracker.pages.dev/:splat 308`) with git-triggered deployments disabled, so every old URL — pages, auth callbacks, and webhook POSTs — auto-resolves to the new domain with method and body preserved.
3. Update Firebase Auth Authorized domains, the Google OAuth `__/auth/handler` redirect URI, Twilio/GroupMe webhook targets, and any EAS remote env vars to the new domains.

## Consequences
- The old domains `cisa-campus-work-traker.pages.dev` and `cisa-campus-work-traker-qa.pages.dev` are live 308 redirects to the new ones; they were REMOVED from Firebase Auth Authorized domains (only the new hosts are whitelisted) and must not be re-added there.
- The Google OAuth client still needs the new domain registered (Authorized JavaScript origins + `__/auth/handler` redirect URI) for the same-origin auth flow, which is active (`VITE_FIREBASE_AUTH_DOMAIN` is set).
- Chosen over deleting the old projects (old URLs would 404; webhooks would break) — a deliberate, zero-downtime cutover for cosmetic correctness.
