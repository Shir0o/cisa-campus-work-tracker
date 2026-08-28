# 0001: E2E Test Execution against QA Environment with Emulator Parity

## Status
Accepted

## Context
End-to-end (E2E) browser tests verify mission-critical campus workflows including role-based permissions, administrative settings, and gospel partner assignments. Running tests against production Firestore risks data pollution and unintended state mutation, while purely mocking Firestore loses fidelity with security rules and complex multi-document transaction semantics.

## Decision
1. All standard E2E test suites (`npm run test:e2e`) execute against the dedicated live QA Firestore database (`qa-db`) in the `sac-campus-hub` Firebase project, using real seeded role accounts.
2. Local offline runs (`npm run test:e2e:emulator`) mirror the exact same `qa-db` dataset and role accounts against the local Firebase emulator suite.
3. Tests that perform administrative state mutations (such as gospel partner pairings in `settings/partners` or day's goals in `settings/goal`) must clean up modified singletons and ephemeral invitations upon test completion (`afterAll`/`afterEach`) to ensure deterministic repeatability.
4. QA seeding guarantees at least two active trainee accounts (`Zion Adeyemi` and `Caleb Owusu`) so full-timers can pair and manage partners without unseeded dependencies.

## Consequences
- E2E testing reflects genuine Firestore security rules and client-side subscriptions without risking production data.
- Shared QA database remains clean and coherent across test runs due to automated cleanup in test suites.
- Developers without cloud credentials can still run full test suites via the local emulator using identical seed structures.
