# @cisa/core

Platform-agnostic TypeScript shared by the web app (`apps/web`, currently the
repo root) and the React Native app (`apps/mobile`). This is the "one codebase"
win: business logic, types, and pure helpers live here once and are consumed by
every platform.

## What belongs here

Only **pure / platform-agnostic** code — no DOM, no `firebase/*` init, no
React Native, no Tailwind class strings. Concretely:

- `types.ts` — shared domain types (Contact, Interaction, BoardDoc, …).
- `permissions.ts` — roles, `NAV_ITEMS`, `canAccessRoute`, `hasMinRole`.
- `board.ts` — The Board doc model + pure date/audience helpers.
- `inbox.ts` — the "From the team" / trainee-waiting feed derivations.
- `walking.ts` — full-timer ↔ trainee relationship config + lookups.
- `seasons.ts` — season derivation (pure parts; the Firestore hook stays in the
  app data layer).
- `threads.ts` — thread message types + pure helpers (the Firestore CRUD stays
  in the app data layer).
- `utils.ts` — phone/initials/relative-time helpers (the web-only `cn()` Tailwind
  merge helper is intentionally **not** here).

## What does NOT belong here (yet)

The Firebase data-access modules (`threads` CRUD, `seasons` hooks, `rsvp`,
`todos`, `prayers`, …) still live per-app because they import a platform-specific
Firebase init. Phase 1 of the migration will move them here behind an injected
`db` handle so both apps share them too.

## Test

```
npm install
npm test
```

Tests are the behavior oracle for the migration — the ported RN screens must
produce the same results these functions define.
