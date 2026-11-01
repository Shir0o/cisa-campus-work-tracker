# CISA Campus Work Tracker Blueprint

[![CI](https://github.com/Shir0o/cisa-campus-work-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Shir0o/cisa-campus-work-tracker/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

A web and mobile application for full-time campus ministers, trainees, students, and community partners to track campus ministry contacts, follow-up interactions, prayer burdens, gatherings, and administrative configurations.

---

## System Overview

This repository is structured as a monorepo containing the web client, native mobile app, shared core libraries, edge proxies, and background cloud functions:

- **Web SPA & Server**: Primary web client built with React 19, Vite, and Tailwind CSS, backed by an Express API server (`server.ts`).
- **Native Mobile App**: Cross-platform iOS and Android application built with React Native and Expo SDK (`apps/mobile`).
- **Shared Core**: Pure platform-agnostic business logic, domain models, and permission rules (`packages/core`).
- **Edge Functions**: Cloudflare Pages reverse-proxy routes resolving browser third-party storage partitioning (`functions`).
- **Background Cloud Functions**: Firebase Cloud Functions v2 handling push notification delivery, translation sweeps, and staff reminders (`firebase-functions`).
- **Repository Automation**: Verification guards, database seeding routines, and autonomous maintenance scripts (`scripts`).

---

## Domain Concepts & Roles

Access and capabilities within CISA Campus Work Tracker are partitioned into four canonical roles (see [`CONTEXT.md`](CONTEXT.md) for full terminology):

- **Full-timer (`admin`)**: Administrative staff role with team-wide oversight, administrative settings access, gospel partner configuration, and full data access.
- **Trainee (`manager`)**: Field worker role managing assigned contacts, joining The Journey board, and participating in term gospel partnerships.
- **Student (`operator`)**: Student leader role with access to People directory, gatherings, and prayer requests.
- **Community (`viewer`)**: Guest/supporter role with read access to shared prayer requests, gatherings, and announcements.

---

## Local Interface & Invariants

- `createApp`: Express backend application factory initializing rate limits, Gemini AI integrations, and Firebase Admin SDK (`server.ts`).
- Endpoints: REST API routes for quick-add parsing, contact deduplication (`/api/combine-contacts`), tag merging, feedback synchronization, translation, and guest doc access (`server.ts`).
- Rate Limiting: Standard rate limiter enforces 100 requests per 5-minute window; write endpoints enforce stricter limits (`server.ts`).
- Payload Limits: Express body parser strictly caps incoming JSON and URL-encoded payloads at 50MB (`server.ts`).
- Local Side Effects: Reads and writes to Google Cloud Firestore via Firebase Admin SDK, verifies Twilio webhook signatures, proxies GitHub issues, and queries Gemini generative AI endpoints (`server.ts`).

---

## Subdirectories & System Boundaries

- [apps](./apps/README.md): Standalone client application targets housing the cross-platform Expo / React Native mobile application (`apps/mobile`).
- [src](./src/README.md): Primary web Single Page Application, user interface components, views, and browser state management.
- [packages](./packages/README.md): Platform-agnostic business logic, permissions, domain types, and data adapters (`@cisa/core`).
- [functions](./functions/README.md): Cloudflare Pages edge functions for `/api/*` reverse proxying and same-origin Firebase authentication.
- [firebase-functions](./firebase-functions/README.md): Firebase Cloud Functions background triggers, push notification delivery (Expo/WebPush), translation sweeps, and staff reminders.
- [scripts](./scripts/README.md): Repository automation, database seeding, verification guards, and weekly maintenance runners.

---

## Global Invariants

- **Four Canonical Roles**: All platform capabilities are partitioned into `admin` (Full-timer), `manager` (Trainee), `operator` (Student), and `viewer` (Community) per [`CONTEXT.md`](CONTEXT.md).
- **Trainee Contact Isolation**: Trainees are strictly scoped to their tied contacts; list queries require `visibleTo` array constraints matching active staff assignment.
- **Dual Instantiation Guard**: Native mobile bundles explicitly block `packages/core/node_modules` to preserve Firebase singleton state and prevent broken `instanceof` checks.
- **Platform-Agnostic Core**: Shared business logic in `@cisa/core` is strictly decoupled from browser DOM and React Native bindings.

---

## Global Side Effects

- **Google Cloud Firestore**: Primary persistent data store across `prod` and `qa-db` databases for contacts, interactions, prayers, and tasks.
- **Firebase Realtime Database**: Low-latency collaborative document synchronization for The Board.
- **Push Notification Services**: Outbound push dispatch to Expo Push Notification API and Web Push endpoints.
- **Google Gemini Generative AI**: Server-side multimodal parsing for quick-add audio/images and scheduled bilingual translations.
- **GitHub API**: Two-way issue tracker synchronization and weekly maintenance pull request generation.

---

## System Verification

- Run: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Full Gate: `npm run typecheck && npm run lint && npm run build`
