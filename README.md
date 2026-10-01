# CISA Campus Work Tracker

[![CI](https://github.com/Shir0o/cisa-campus-work-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Shir0o/cisa-campus-work-tracker/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

A web and mobile application for full-time campus ministers, trainees, students, and community partners to track campus ministry contacts, follow-up interactions, prayer burdens, gatherings, and administrative configurations.

---

## Repository Structure

This repository is structured as a monorepo containing the web client, native mobile app, shared core libraries, and end-to-end testing suites:

| Subsystem | Path | Description | Tech Stack |
| --- | --- | --- | --- |
| **Web App & Server** | `.` / [`src/`](src/) | Primary web SPA and backend API server (`server.ts`) | React 19, Vite, Tailwind CSS, Express |
| **Mobile App** | [`apps/mobile/`](apps/mobile/) | Native iOS and Android application | React Native, Expo SDK, Maestro E2E |
| **Shared Core** | [`packages/core/`](packages/core/) | Pure platform-agnostic business logic, domain types, and permissions | TypeScript |
| **E2E Tests** | [`e2e/`](e2e/) | Web end-to-end integration test suite driven against local emulators | Playwright, Firebase Local Emulator Suite |
| **Edge & Cloud Functions** | [`functions/`](functions/), [`firebase-functions/`](firebase-functions/) | Cloudflare Pages proxy routes and Firebase Cloud Functions (push notifications) | TypeScript, Node.js |
| **Architecture Records** | [`docs/adr/`](docs/adr/) | Architectural Decision Records documenting design tradeoffs | Markdown |

---

## Domain Concepts & Roles

Access and capabilities within CISA Campus Work Tracker are partitioned into four canonical roles (see [`CONTEXT.md`](CONTEXT.md) for full terminology):

- **Full-timer (`admin`)**: Administrative staff role with team-wide oversight, administrative settings access, gospel partner configuration, and full data access.
- **Trainee (`manager`)**: Field worker role managing assigned contacts, joining The Journey board, and participating in term gospel partnerships.
- **Student (`operator`)**: Student leader role with access to People directory, gatherings, and prayer requests.
- **Community (`viewer`)**: Guest/supporter role with read access to shared prayer requests, gatherings, and announcements.

---

## Quickstart

### Prerequisites

- **Node.js**: `v20+` (or `v24+` recommended, matching CI)
- **npm**: `v10+`
- **JDK**: `21+` (required if running the Firebase Local Emulator Suite)

### 1. Install Dependencies

Install repository dependencies for the root web app and shared packages:

```bash
npm install
```

*(For mobile setup, see [`apps/mobile/README.md`](apps/mobile/README.md) and [`apps/mobile/SETUP.md`](apps/mobile/SETUP.md).)*

### 2. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Review `.env` to configure your keys. For basic local development without external services, default emulator settings work out-of-the-box. Key environment variables include:
- `GEMINI_API_KEY`: Server-side secret used for quick-add parsing, translation, and coordination note analysis.
- `VITE_FIREBASE_FIRESTORE_DB_ID`: Firestore database ID (`prod` or `qa-db`).
- `VITE_USE_FIREBASE_EMULATOR`: Set to `true` to target local Firebase emulators.

### 3. Start Development Server

```bash
npm run dev
```

The web application starts locally with Vite and the Node API server at `http://localhost:3000`.

---

## Testing & Verification

The project enforces test-driven development (TDD), zero lint errors, and ratcheted test coverage thresholds. Before submitting pull requests, run the verification pipeline:

```bash
# Typecheck TypeScript across the codebase
npm run typecheck

# Lint source files
npm run lint

# Enforce design tokens and i18n rules
npm run check:colors
npm run check:i18n

# Run unit tests and enforce coverage ratchets
npm run test:coverage

# Verify production build
npm run build
```

### End-to-End (E2E) Testing

Playwright tests run against the Firebase Local Emulator Suite with zero external secrets:

```bash
npm run test:e2e:emulator
```

For full details on E2E testing architecture, role personas, and seeding, consult [`e2e/README.md`](e2e/README.md).

---

## Documentation

- [`CONTEXT.md`](CONTEXT.md) — Canonical glossary and domain model (rules, terminology, roles).
- [`SECURITY.md`](SECURITY.md) — Security policy and vulnerability disclosure procedures.
- [`CLOUDFLARE_DEPLOYMENT.md`](CLOUDFLARE_DEPLOYMENT.md) & [`GCLOUD_DEPLOYMENT.md`](GCLOUD_DEPLOYMENT.md) — Infrastructure and deployment setup.
- [`docs/adr/`](docs/adr/) — System and architectural decision records.

---

## License

This project is licensed under the [Apache 2.0 License](LICENSE).

