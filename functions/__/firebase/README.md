# Cloudflare Pages Firebase Init Provider (`functions/__/firebase`)

## Overview
Cloudflare Pages Function serving `/__/firebase/init.json` with client Firebase app configuration and project credentials for the same-origin auth helper bootstrap (#557).

## Interface
- `onRequest`: Cloudflare Pages handler answering `/__/firebase/init.json` requests (`init.json.ts`)
- `PagesFunction`: Type definition for Cloudflare Pages function context (`init.json.ts`)

## Invariants
- API key resolution: Resolves `apiKey` from `env.VITE_FIREBASE_API_KEY` with fallback to default project key (`init.json.ts`).
- Auth domain resolution: Resolves `authDomain` from `env.VITE_FIREBASE_AUTH_DOMAIN` with fallback to `cisa-campus-work-tracker.pages.dev` (`init.json.ts`).
- Project ID resolution: Resolves `projectId` from `env.VITE_FIREBASE_PROJECT_ID` with fallback to `sac-campus-hub` (`init.json.ts`).
- Configuration payload: Always responds with fixed `appId`, `storageBucket`, `messagingSenderId`, and `measurementId` (`init.json.ts`).
- Cache headers: Always returns HTTP 200 with headers `Content-Type: application/json` and `Cache-Control: public, max-age=3600` (`init.json.ts`).

## Side Effects
- None

## Verification
- Run: `npm test`
