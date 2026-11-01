# Web Application Source Root (`src`)

## Overview
Website version of CISA Campus Work Tracker: primary Single Page Application (SPA) targeting desktop and mobile web browsers (React 19, Vite, Tailwind CSS), distinct from the native mobile application in `apps/mobile` (React Native, Expo SDK). Shared domain types, permission logic, and data adapters are consumed from `@cisa/core`.

## Interface
- `useLayout` (`App.tsx`)
- `useOptionalLayout` (`App.tsx`)
- `App` (`App.tsx`)
- `CONTACTS` (`constants.ts`)
- `ACTIVITIES` (`constants.ts`)
- `TASKS` (`constants.ts`)
- `MET_VIA` (`types.ts`)
- `Contact` (`types.ts`)
- `CombinedFrom` (`types.ts`)
- `Stage` (`types.ts`)
- `Metric` (`types.ts`)
- `Activity` (`types.ts`)
- `SystemActivity` (`types.ts`)
- `Subtask` (`types.ts`)
- `Task` (`types.ts`)
- [components](./components/README.md): Top-level directory grouping modular UI components, modals, shell navigation, and feature-specific component trees.
- [hooks](./hooks/README.md): Custom React hooks managing reactive subscriptions, contact interactions, story feeds, and question badge counters.
- [lib](./lib/README.md): Client-side domain helpers, Firebase initialization, crypto credential vault, permissions, and markdown parsing.
- [scripts](./scripts/README.md): Build-time asset compilation utilities compiling markdown help documentation and what-new release logs into client JSON.
- [server](./server/README.md): Node.js server-side business engines for contact deduplication, tag combination, feedback synchronization, and test account purging.
- [services](./services/README.md): Client services integrating with external platforms including Google Sheets API and realtime chat providers.
- [views](./views/README.md): Full-page router views covering contact directory, The Journey board, prayers, gatherings, coordination notes, and credential vault.

## Invariants
- [App.tsx] throw new Error("useLayout must be used within a LayoutProvider");

## Side Effects
- [App.tsx] const lastSeen = typeof window !== 'undefined' ? localStorage.getItem(WHATS_NEW_STORAGE_KEY) : null;
- [App.tsx] const unsubscribe = onSnapshot(

## Verification
- Run: `npm test`
