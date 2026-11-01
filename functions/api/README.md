# Cloudflare Pages API Gateway Proxy (`functions/api`)

## Overview
Cloudflare Pages Function catch-all proxy that routes `/api/*` requests to the GCP Cloud Run backend service, handling CORS preflight, IP forwarding, and Safari response-streaming header hygiene.

## Interface
- `onRequest`: Cloudflare Pages catch-all route handler for `/api/*` requests (`[[path]].ts`)
- `Env`: Environment bindings containing optional `BACKEND_API_URL?: string` (`[[path]].ts`)
- `PagesFunction<Env>`: Type definition for Cloudflare Pages function context (`[[path]].ts`)

## Invariants
- Preflight handling: HTTP OPTIONS preflight requests immediately return 204 No Content with `Access-Control-Allow-Origin: *`, allowed methods GET/POST/PUT/DELETE/OPTIONS, allowed headers, and `max-age: 86400` without querying the backend (`[[path]].ts`).
- Backend fallback: Defaults to `https://campus-hub-backend-d2h5m26nrq-wl.a.run.app` if `env.BACKEND_API_URL` is unset (`[[path]].ts`).
- Forwarding headers: Injects client forwarding headers: `X-Forwarded-Host` from `url.host`, `X-Forwarded-Proto` from `url.protocol`, and `X-Forwarded-For` from `cf-connecting-ip` header (`[[path]].ts`).
- Body payload: Forwards request payload as ArrayBuffer for all HTTP methods except GET and HEAD (`[[path]].ts`).
- Safari streaming hygiene: Deletes transport/encoding headers (`content-length`, `content-encoding`, `transfer-encoding`, `connection`) before streaming backend response to client to prevent Safari EOF decompression errors (`[[path]].ts`).
- Manual redirect: Backend fetch uses `redirect: 'manual'` to preserve response redirect semantics without automatic following (`[[path]].ts`).
- Error trapping: Traps network or gateway fetch errors and returns HTTP 502 with JSON error payload `{ success: false, source: 'cloudflare-pages-proxy', ... }` and `Access-Control-Allow-Origin: *` (`[[path]].ts`).

## Side Effects
- Outbound network HTTP requests to the GCP Cloud Run backend API (`[[path]].ts`).
- Writes request routing, forwarding destination, and gateway error log lines to Cloudflare Pages runtime console (`[[path]].ts`).

## Verification
- Run: `npm test`
