# @cisa/core

Platform-agnostic TypeScript shared by the web app (repo root) and the React Native app (`apps/mobile`). This is the "one codebase" win: business logic, types, and pure helpers live here once and are consumed by every platform.

[← Back to Root README](../../README.md)

---

## Overview
Root package manifest and platform-agnostic core library (`@cisa/core`) shared across the web application and React Native mobile client, encapsulating domain types, business rules, permission hierarchies, and data access contracts.

## Interface
- Package exports: Exports `./src/index.ts` containing all pure helpers, types, and data modules (`package.json`)
- [src](./src/README.md): Platform-agnostic TypeScript core logic, models, permissions, and state derivations
- [src/data](./src/data/README.md): Firestore and Realtime Database data adapters behind injected database instances

## What belongs here
Only **pure / platform-agnostic** code — no DOM, no un-injected `firebase/*` init, no React Native, no Tailwind class strings. Concretely:
- `types.ts` — shared domain types (Contact, Interaction, BoardDoc, …).
- `permissions.ts` — roles, `NAV_ITEMS`, `canAccessRoute`, `hasMinRole`.
- `board.ts` — The Board doc model + pure date/audience helpers.
- `inbox.ts` — the "From the team" / trainee-waiting feed derivations.
- `walking.ts` — full-timer ↔ trainee relationship config + lookups.
- `seasons.ts` — season derivation (pure parts; the Firestore hook stays in the app data layer).
- `threads.ts` — thread message types + pure helpers (the Firestore CRUD stays in the app data layer).
- `utils.ts` — phone/initials/relative-time helpers (the web-only `cn()` Tailwind merge helper is intentionally **not** here).

## What does NOT belong here (yet)
Platform-specific Firebase init instances belong in the consuming apps; data-access modules here require caller-injected database handles.

## Invariants
- Pure platform-agnostic implementation: Zero DOM references, zero React Native bindings, zero hard-coded Tailwind classes, and zero un-injected Firebase app initializations.
- Exact behavioral parity: Web and mobile consumers evaluate identical permissions, date mathematics, and domain invariants.

## Side Effects
- In-memory cache updates in `walking.ts` (full-timer and trainee live roster sets); persistent storage side effects are strictly isolated to `src/data/*` (such as `src/data/partners.ts`, `src/data/todos.ts`, `src/data/prayers.ts`).

## Verification
- Run: `npm --prefix packages/core test`
