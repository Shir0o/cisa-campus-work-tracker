# Architecture Overview

## System Design at a Glance

CISA Campus Work Tracker is a **three-tier application** (web + mobile + backend) sharing a **unified business logic layer** in TypeScript:

```
┌─────────────────────────────────────────────────────┐
│                  FIRESTORE (Database)               │
│        (Collections: users, contacts, prayers,      │
│         events, feedback, notifications, etc.)      │
└──────────────────────────┬──────────────────────────┘
         ▲                  │                  ▲
         │                  │                  │
    ┌────┴───────────────────▼────────────────┴────┐
    │      AUTHENTICATION (Firebase Auth)          │
    │  (Email/password, ID tokens, custom claims)  │
    └─────────────────────────────────────────────┘
         ▲                                      ▲
         │                                      │
    ┌────┴──────────────────────┐    ┌─────────┴─────────┐
    │   WEB APP (React)          │    │ MOBILE APP (RN)   │
    │   (src/, server.ts)        │    │ (apps/mobile/)    │
    │                            │    │                   │
    │  - Vite (dev/build)       │    │ - Expo (Metro)    │
    │  - Express (API routes)   │    │ - expo-router     │
    │  - 17KB React bundle      │    │ - Firestore SDK   │
    │  - Tailwind CSS           │    │ - Native UI       │
    └────────────┬──────────────┘    └──────────┬────────┘
                 │                              │
                 │        ┌──────────────────────┤
                 │        │                      │
                 ▼        ▼                      ▼
    ┌────────────────────────────────────────────────────┐
    │    SHARED CORE LOGIC (@cisa/core)                  │
    │                                                    │
    │  - types.ts (Contact, Task, Prayer, etc.)         │
    │  - permissions.ts (role hierarchy, canAccessRoute)│
    │  - myday.ts (cockpit derivations)                 │
    │  - board.ts (coordination logic)                  │
    │  - inbox.ts (team inbox feed)                     │
    │  - data/* (platform-agnostic Firestore reads)     │
    │  - Pure helpers (no Firebase init, DOM, or RN)    │
    └────────────────────────────────────────────────────┘
```

---

## Web App Architecture

### Entry Point & Routing
- **`src/main.tsx`** → React 19 + React Router v7
- **`src/App.tsx`** → Root component with layout context, modal providers, error boundary
- **`src/views/`** → Full-page routed screens (Landing, Directory, MyDay, Settings, etc.)
- **`src/components/`** → Reusable UI (layout, modals, lists, cards, primitives)

### Layout & Styling
- **CSS Framework**: Tailwind (v4.1) via `@tailwindcss/vite` plugin
- **Component library**: Custom primitives + `lucide-react` icons + `motion` animations
- **Responsive**: Desktop-first with mobile-optimized views (`*Mobile.tsx` variants)

### State Management & Data Layer
- **Firebase Auth**: Initialized in `src/lib/firebase.ts` (email/password, ID tokens)
- **Firestore subscriptions**: React hooks in `src/lib/` (real-time listeners on collections)
- **Context API**: `LayoutContext` for global UI state (sidebar collapse, modal open/close)
- **Local storage**: User preferences, inbox read state, theme choice

### Backend Integration
- **Express server** in `server.ts`:
  - Serves static React bundle in production
  - Handles `/api/*` routes (webhooks, AI, admin endpoints)
  - Middleware for request logging, body parsing, authentication
- **Vite dev server**: Proxies `/api/*` to Express in dev (configured in `vite.config.ts`)

### Build & Bundling
- **Vite** bundles `src/**` into static assets
- **esbuild** bundles `server.ts` into `dist/server.cjs` (Node-compatible CommonJS)
- **Final artifact**: `dist/` directory contains React bundle + server + API routes

---

## Mobile App Architecture

### Routing & Navigation
- **Expo router** (file-based routing, `expo-router` v3+):
  - `apps/mobile/app/_layout.tsx` → Root layout with auth gate + theme provider
  - `apps/mobile/app/(tabs)/` → Bottom tab bar (Home, People, Log, Journey, Prayer, More)
  - `apps/mobile/app/*.tsx` → Pushed routes (History, Attendance, Feedback, etc.)
  - Auth gate: Redirects unauthenticated users to `/login`; exempts `/signup`

### UI Framework
- **React Native**: Core primitives (`View`, `Text`, `FlatList`, `ScrollView`, etc.)
- **Styling**: `StyleSheet` (React Native object-based styles) + `expo-linear-gradient`, `expo-blur`
- **Navigation**: Native stack navigators via `expo-router`
- **Icons**: `@expo/vector-icons` (Ionicons + Material)

### Authentication
- **Firebase Auth**: Email/password only (no Google Sign-In yet on native)
- **Session**: ID token refresh via `useEffect` in `AuthProvider`
- **Token persistence**: Firebase SDK handles token storage via `AsyncStorage`

### Data Layer & Real-time Sync
- **Firebase SDK**: Initialized in `apps/mobile/src/lib/firebase.ts`
- **Firestore listeners**: Custom hooks in `apps/mobile/src/lib/data/` + `@cisa/core/src/data/`
- **Pattern**: 
  ```typescript
  // Data hooks fetch & subscribe, then call shared logic from @cisa/core
  const [contacts, loading, error] = useContactsData(db)
  const filtered = filterAndSortDirectory(contacts, searchText, selectedStage)
  ```

### Build & Distribution
- **Metro bundler**: Builds JS bundle optimized for React Native
- **Expo EAS Build**: Cloud build service for iOS/Android (requires Apple Developer / Play Console accounts)
- **OTA Updates**: Use `expo-updates` to deploy code changes without full app rebuild
- **Output**: APK (Android) + IPA (iOS) + web bundle

---

## Shared Core Package (@cisa/core)

### Purpose
Centralize business logic that both web and mobile apps must share identically. **No platform-specific code** (no Firebase init, no DOM, no React Native imports).

### Structure
```
packages/core/src/
├── types.ts              # Domain types (Contact, Task, Prayer, etc.)
├── permissions.ts        # Role hierarchy, canAccessRoute, NAV_ITEMS
├── myday.ts              # Full-timer cockpit derivations
├── board.ts              # Board audience logic, archive helpers
├── inbox.ts              # "From the team" feed derivation
├── walked.ts / walking.ts # Full-timer ↔ trainee relationships
├── threads.ts            # Thread message types + pure helpers
├── utils.ts              # Utilities (phone format, initials, relative time)
├── [feature].ts          # Domain logic (answered.ts, attendance.ts, history.ts, etc.)
├── data/                 # Firestore CRUD (injected db handle)
│   ├── contacts.ts       # subscribeContacts, addContact, updateContact
│   ├── prayers.ts        # subscribePrayers, updatePrayerStatus
│   ├── tasks.ts          # subscribeTasks, addTask, toggleTask
│   ├── users.ts          # subscribeUsers, changeUserRole, sendInvitation
│   └── ...               # Other data modules
└── index.ts              # Public exports
```

### Design Pattern
```typescript
// Pure function (no Firebase)
export function filterAndSortDirectory(
  contacts: Contact[],
  query: string,
  stageId?: string
): Contact[] {
  // Filter, search, sort logic
  return filtered
}

// Data access (injected db handle)
export function subscribeContacts(
  db: Firestore,
  onSuccess: (contacts: Contact[]) => void,
  onError: (error: Error) => void
) {
  // Return unsubscribe function
  return onSnapshot(collection(db, 'contacts'), ...)
}
```

### Testing
- 90+ unit tests in `packages/core/test/`
- Serve as the behavior oracle for web & mobile parity
- Run independently: `cd packages/core && npm test`

---

## Firestore Database Schema

### Collection Structure
```
firestore (sac-campus-hub)
├── users/{uid}                 # User profile + role
├── contacts/{id}               # Contact record
│   └── threads/{threadId}      # Walking-together conversations
├── prayers/{id}                # Corporate prayer
│   └── holds/{uid}             # Who's holding this prayer
├── personalPrayers/{uid}/{id}  # User's private prayers
├── events/{id}                 # Gatherings (meetings, small groups)
│   ├── rsvps/{uid}             # RSVP status (going, not-going, maybe)
│   └── attendance/{uid}        # Attendance record (present, late, absent)
├── tasks/{id}                  # Team & personal tasks
├── feedback/{id}               # User-submitted feedback
├── notifications/{uid}/{id}    # Personal notification
├── boardDocs/{docId}           # Coordination Notes page
├── boardNotes/{noteId}         # Archived learning record
├── activities/{id}             # Activity history (for audit trail)
├── gatheringTypes/{id}         # Managed gathering kinds (Weekly, etc.)
├── stages/{id}                 # Customizable contact pipeline stages
├── invitations/{email}         # Pending sign-up invitation
├── userPreferences/{uid}       # User settings (contact picker, theme, etc.)
└── settings/{docId}            # Team config (active season, club rush toggle)
```

### Security Model (firestore.rules)
- **Global deny** → allow read/write only for specific rules
- **Role-based gates**: `isAdmin()`, `isManager()`, `isOperator()`, `isViewer()`
- **Ownership gates**: `isOwner(userId)`, `isApprovedUser()`
- **Field-level validation**: Incoming data shape checked before write
- **Examples**:
  - **Contacts**: Approved users can read; managers+ can write
  - **Prayers**: Public-marked prayers readable by anyone; only author + team can edit
  - **Board**: Role-scoped reads (managers see all, trainees see trainees+everyone, students see everyone-only)
  - **Feedback**: Anyone can create; admin/manager can review/delete
  - **Notifications**: Owner can read/write own notifications

### Real-time Database (for Board collaboration)
```
/boardDocsRtdb/{docId}/
├── edits                    # Y.js transaction log
├── awareness                # Cursor/selection tracking
```
Used by Yjs provider (`src/lib/yjsRtdbProvider.ts`) to sync live edits on Board pages.

---

## Backend Services (Express)

### Main Server (`server.ts`)
- **Port**: 3000
- **Middleware**: JSON parsing (50MB limit), request logging, error handling
- **Routes**:
  - `/api/webhook/groupme` → GroupMe bot (SMS relay)
  - `/api/webhook/sms` → Twilio SMS webhook
  - `/api/quick-add` → Rapid contact creation (requires token or automation header)
  - `/api/feedback` → Submit feedback + AI analysis
  - `/api/analyze-notes` → Board page AI analysis
  - `/api/webhook/logs` → View webhook request history

### Lazy-Initialized Singletons
- **Admin Firestore** → `getAdminDb()` (initialized once on first request)
- **Gemini AI client** → `getAiClient()` (lazy init for cost efficiency)

### Authentication on Backend
- **ID token verification**: Required for most `/api/` routes (optional for webhooks)
- **Custom claims**: Admin users have `custom: { role: 'admin' }` in ID token
- **Fallback**: Super-admin email hardcoded as `yilongwang05@gmail.com`

### Error Handling
- Graceful 500/400 responses with descriptive error messages
- Firestore `permission_denied` → 403 Forbidden
- Invalid request → 400 Bad Request
- Uncaught errors → 500 Internal Server Error

---

## Key Libraries & Dependencies

### Web App
| Package | Purpose | Notes |
|---------|---------|-------|
| react, react-dom | UI framework | v19 |
| react-router-dom | Routing | v7 |
| firebase | Client SDK | Auth + Firestore |
| vite | Build tool | v6 + dev server |
| tailwindcss | Styling | v4 with Vite plugin |
| lucide-react | Icons | Lightweight, tree-shakeable |
| @tiptap | Rich text editor | Board Markdown editing |
| yjs | CRDT | Conflict-free board collaboration |
| date-fns | Date utilities | Relative time, formatting |
| clsx, tailwind-merge | Class helpers | Conditional Tailwind |

### Mobile App
| Package | Purpose | Notes |
|---------|---------|-------|
| react, react-native | UI framework | React 18.3 for RN compat |
| expo | Build system | v52 |
| expo-router | File-based routing | v3+ |
| firebase | Client SDK | Auth + Firestore |
| @react-native-async-storage/async-storage | Persistence | Token/pref storage |
| @expo/vector-icons | Icons | Ionicons + Material |
| expo-linear-gradient, expo-blur | Effects | Native platform features |

### Shared Core
| Package | Purpose | Notes |
|---------|---------|-------|
| typescript | Static typing | v5.8 |
| vitest | Testing | Unit tests + coverage |
| firebase (types only) | Type definitions | Used for TS but no runtime dep |

### Backend
| Package | Purpose | Notes |
|---------|---------|-------|
| express | HTTP server | v4 |
| firebase-admin | Admin SDK | Firestore CRUD + auth token verify |
| @google/genai | Gemini AI | Feedback analysis + note generation |
| googleapis | Google Sheets | Sync integration |

---

## Data Flow Patterns

### Client → Firestore (Write)
```
React/RN Component
    ↓ (User action)
    └─→ Data layer function (e.g., addContact)
         └─→ Firebase SDK: addDoc() → Firestore
              ↓ (Rule check)
              └─→ Success: real-time listener fires with updated doc
                  Error: throws permission_denied / validation error
```

### Firestore → Client (Read)
```
Firestore rule check (role-based)
    ↓
React/RN Hook: useEffect + onSnapshot
    ├─→ Initial snap
    ├─→ Real-time updates (pushed to client)
    └─→ Error handling (permission, network)
         └─→ Component re-renders with new data
```

### Backend → Firestore
```
Express Route (e.g., POST /api/feedback)
    ↓ (Verify token)
    └─→ Admin Firestore SDK (full write access)
         └─→ Firestore (no rule check; Admin SDK bypasses rules)
              ↓
              └─→ Response to client
```

### External Webhooks → Backend
```
GroupMe / Twilio
    ↓ (HTTP POST)
    └─→ Express webhook route
         ├─→ Verify signature (Twilio)
         ├─→ Parse payload
         └─→ Write to Firestore OR send SMS reply
              └─→ 200 OK response
```

---

## Build & Deployment Artifacts

### Web App (Production)
```
dist/
├── assets/                     # Bundled React + CSS
├── server.cjs                  # Node-compatible server bundle (esbuild output)
├── functions/api/[[path]].ts   # Serverless routing definitions
└── index.html                  # Entry point (Vite SSR template)
```

**Hosting**: Google Cloud Run (Docker container) or Cloudflare Workers

### Mobile App (Production)
```
Expo EAS Build
├── app-release.apk            # Android
├── app.ipa                     # iOS (requires Apple signing)
└── web/                        # Expo web bundle (for testing)
```

**Distribution**: Apple App Store + Google Play Store (via Expo EAS Submit) or Expo Go (testing)

---

## Performance Considerations

### Web App
- **Code splitting**: Lazy routes (CoordinationNotes, Messages) via `React.lazy()`
- **Bundle size**: ~17KB React bundle (Vite optimized)
- **Real-time cost**: Firestore reads metered per listener (one per collection subscription)
- **Rendering**: Tailwind JIT compilation in dev; optimized in production

### Mobile App
- **Bundle size**: ~2MB IPA + APK (React Native + Expo SDK optimized)
- **Metro bundling**: Incremental bundling for fast reload during dev
- **OTA updates**: Can push code changes without full rebuild (via `expo-updates`)
- **Native modules**: Minimal (Auth, AsyncStorage, Vector Icons) to keep bundle lean

### Firestore
- **Indexes**: Defined in `firestore.indexes.json`; auto-deployed via CI
- **Query optimization**: Composite indexes for multi-field queries (e.g., `targetId + createdAt`)
- **Rule efficiency**: Rules evaluated in parallel; custom claims cached in ID token

---

## Error Handling & Observability

### Client-Side
- **Error boundary**: `<ErrorBoundary>` catches React render errors
- **Firestore errors**: Mapped via `handleFirestoreError()` → user-facing messages
- **Network errors**: Graceful retry via React hooks; user sees "loading" or "error" state
- **Unhandled promise rejections**: Logged to console (in production, could send to Sentry)

### Server-Side
- **Request logging**: Terminal output for webhooks + API routes
- **Firebase Admin errors**: Caught + logged; 500 response to client
- **Webhook validation**: Signature check (Twilio); invalid → 401 Unauthorized

### Monitoring
- **Firestore rules**: Emulator test suite (`src/test/firestore.rules.test.ts`)
- **CI/CD**: GitHub Actions workflow (typecheck, lint, test, build)
- **Manual testing**: E2E tests via Playwright (`e2e/`)

---

## Extension Points & Future Architecture Changes

### Planned Migrations
1. **Phase 4 (Board)**: Implement Board tab on mobile (Yjs + RTDB sync)
2. **Phase 5+**: Consolidate data-access modules further (push more to `@cisa/core`)
3. **Future**: Move remaining web-specific Firebase hooks into `@cisa/core/src/data/*` (currently behind injected `db` handle)

### Extensibility
- **New feature**: Add logic to `@cisa/core/src/`, tests to `packages/core/test/`, then UI in `src/` (web) and `apps/mobile/` (mobile)
- **New API route**: Add to `server.ts` or `functions/api/` files
- **New Firestore collection**: Define in `firestore.rules` + add security rules + add data-layer hook
- **New external integration**: Add webhook route in `server.ts` + route in `functions/api/`

---

## Recommended Reading Order

1. **Start here**: [Quickstart](/openwiki/quickstart.md) for overview
2. **Then**: This file for architecture
3. **Deep dive**: [Data Models](/openwiki/data-models.md) for schema details
4. **How to implement**: [Workflows](/openwiki/workflows.md) for common task patterns
5. **Troubleshoot**: [Testing](/openwiki/testing.md) + [Operations](/openwiki/operations.md)
6. **Recent context**: [Changes](/openwiki/changes.md) for git history
