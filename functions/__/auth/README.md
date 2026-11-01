# Cloudflare Pages Firebase Auth Proxy (`functions/__/auth`)

## Overview
Cloudflare Pages Function transparent reverse-proxy routing `/__/auth/*` requests to `sac-campus-hub.firebaseapp.com` to serve the Firebase Auth helper from the application's own origin, mitigating browser third-party storage partitioning (#557).

## Interface
- `onRequest`: Cloudflare Pages catch-all route handler for `/__/auth/*` helper requests (`[[path]].ts`)
- `FIREBASE_AUTH_DOMAIN`: Upstream target domain constant set to `sac-campus-hub.firebaseapp.com` (`[[path]].ts`)
- `PagesFunction`: Type definition for Cloudflare Pages function context (`[[path]].ts`)

## Invariants
- Route filtering: Rejects any request not starting with `/__/auth/` by returning HTTP 404 Not Found (`[[path]].ts`).
- Upstream target: Preserves request pathname and query parameters while forwarding to `https://sac-campus-hub.firebaseapp.com` (`[[path]].ts`).
- Forwarding headers: Sets `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` from `cf-connecting-ip` (`[[path]].ts`).
- Body payload: Forwards payload as ArrayBuffer for non-GET and non-HEAD requests (`[[path]].ts`).
- Transparent proxying: Uses `redirect: 'manual'` to avoid 302 redirect loops or origin mutation (`[[path]].ts`).
- Safari streaming hygiene: Deletes `content-length`, `content-encoding`, `transfer-encoding`, and `connection` headers to prevent Safari EOF decompression errors (`[[path]].ts`).
- Gateway fallback: Returns HTTP 502 with JSON `{ success: false, source: 'cloudflare-auth-proxy', error: 'Auth helper unavailable' }` if upstream fetch fails (`[[path]].ts`).

## Side Effects
- Outbound network HTTP requests to `sac-campus-hub.firebaseapp.com` (`[[path]].ts`).
- Writes auth proxy routing and error logs to Cloudflare Pages runtime console (`[[path]].ts`).

## Verification
- Run: `npm test`
