# CISA Campus Work Tracker — Quickstart

**What is this?** CISA Campus Work Tracker is a **real-time team collaboration platform** for campus ministries: contact relationship management (CRM), task/prayer management, event attendance tracking, feedback collection, and coordination. Built with React (web), React Native + Expo (mobile), TypeScript, and Google Firestore.

**Who runs it?** Full-timers (staff), Trainees (ministry leaders), Students (participants), and Community members (public sign-ups). Role-based access control shapes every feature.

**Current state:** Both web and native mobile apps are **live and production-ready**. The latest 20 commits (Phase 3 and 2 of the mobile native rebuild) focus on porting core team workflows to iOS/Android while maintaining feature parity with the existing React web app. Daily Firestore backups are enabled.

---

## Quick Navigation

- **New to the codebase?** Start at [Architecture Overview](/openwiki/architecture.md)
- **Want to understand the data model?** See [Data Models & Schema](/openwiki/data-models.md)
- **Need to add or fix a feature?** Follow [Workflows & Common Tasks](/openwiki/workflows.md)
- **Setting up or deploying?** See [Operations & Deployment](/openwiki/operations.md)
- **Running tests?** Check [Testing Guide](/openwiki/testing.md)
- **What changed recently?** Inspect [Recent Changes & Git History](/openwiki/changes.md)

---

## What You'll Find Here

### Web App (`/src`, `/server.ts`)
- **React** SPA with Vite + TypeScript
- **Express** backend handling webhooks, AI features, and serverless APIs
- Role-based navigation and access control
- Features: My Day cockpit, People directory, Prayer management, Event attendance, Coordination notes, Feedback, History, Settings

### Mobile App (`/apps/mobile`, `/packages/core`)
- **React Native + Expo** targeting iOS, Android, and web
- **Shared business logic** in `@cisa/core` (types, permissions, pure derivations)
- Features: My Day landing, People tab, Prayer tab, History, Attendance, Gatherings, Settings, Feedback (submit + admin review), Notifications, Search
- Authentication: Firebase email/password (no Google Sign-In on native yet)

### Shared Core Package (`/packages/core`)
- **Pure, platform-agnostic TypeScript** — no Firebase SDK init, no DOM, no React Native imports
- Shared domain types, permissions, derivations (My Day logic, Board, Inbox, Walking-together relationships)
- Full unit-test coverage (90+ tests) as the behavior oracle for web and mobile parity

### Backend (`/server.ts`, `/functions/api/`)
- **Webhook & API routes:** GroupMe, SMS (Twilio), quick-add, feedback, webhook logs
- **AI integration:** Google Gemini for feedback analysis and note generation
- **Firebase Admin SDK:** Firestore CRUD for operations not exposed to the client

### Database (`firestore.rules`, schema)
- **Firestore:** Collections for users, contacts, prayers, events, tasks, feedback, notifications, etc.
- **Realtime Database:** Board document collaboration (Yjs provider + RTDB backend)
- **Security:** Role-based rules enforced at write time; all public forms guarded by anti-abuse checks

---

## Key Concepts at a Glance

### Roles & Permissions
- **Admin**: Full access (team management, settings, all team data)
- **Manager**: Admin-like + feedback review (can manage gatherings, roles, invitations)
- **Operator**: Trainee-level (can add contacts, log interactions, manage personal tasks/prayers)
- **Viewer**: Community/student read-mostly (can RSVP to events, submit feedback, pray privately)

See `@cisa/core`'s `permissions.ts` for the canonical role hierarchy and `canAccessRoute` gates.

### The Board
- **Coordination Notes** — markdown-editable pages with full team collaboration (live cursor tracking, conflict-free edits via Yjs + RTDB)
- **Page Audience:** `team` (managers only) / `trainees` (trainees+) / `everyone` (public)
- **Archive** — promoted highlights & learnings, indexed by date/series

### Contact Workflows
- **Contacts**: Core person record (name, stage, role, tags, notes, spiritual background, interests)
- **Interactions**: Logged moments (call, email, event attendance, edit, etc.)
- **Walking-together threads**: Lightweight conversations between trainee ↔ full-timer on a contact
- **Staged pipeline**: Customizable contact stages (e.g., "Interested", "Growing", "Rooted") per team

### Prayers & Answers
- **Corporate prayers**: Team-managed (full-timers set status, anyone can mark "holding" it)
- **Personal prayers**: User-owned, private
- **Answered testimonies**: User-authored, archived on the "Answered" wall
- **Prayer holds**: Track who's "holding" / "carrying" / "praying for" each person

### Events & Attendance
- **Gatherings**: Named events with a type (Weekly, Small Group, etc.), date, location
- **Attendance**: Binary (present/late/absent), logged per person per event
- **RSVP**: Students & Community can signal interest; staff see counts

### My Day (Full-timer Cockpit)
- **Relational nudge**: "Your longest-since-touched contact is …"
- **From the team**: Inbox of new contacts, logged interactions, questions from the team
- **Your contacts**: Curated list picker
- **Your week**: Featured learnings/nudges
- **Your tasks**: Team-assigned and personal
- **Your prayers**: Corporate (with status toggle) and personal
- **Your figures**: Team stats (total contacts, conversations this week, etc.)

### Feedback
- **Submit**: Any signed-in user can submit feedback (4 kinds: Thought, Idea, Issue, Request)
- **Manage**: Admin/manager reviews, status cycles (pending → discussed → addressed → archived), delete, link to GitHub issues
- **Mobile**: Separate screens for submit & admin review (web uses a modal + dashboard)

### Notifications
- **Personal**: Direct messages for contacts added by me, interactions on my contacts, questions addressed to me
- **Broadcast**: Team-wide nudges (e.g., "Reminder: fill prayer requests")
- **Mark as read**: Personal and broadcast; broadcast also supports per-user "set aside" (dismiss)

---

## Running Locally

### Web App
```bash
npm install
npm run dev                 # Start dev server on http://localhost:5173
npm run build              # Build static + server bundle
npm run test               # Run Vitest (web + core package, excludes mobile)
npm run test:coverage      # Coverage report (87.5% line threshold enforced)
npm run lint               # ESLint TS/TSX + Firestore rules
npm run typecheck          # TypeScript check
```

### Mobile App
```bash
cd apps/mobile
npm install
npx expo start             # Launch Metro; press 'w' for web, 'i' for iOS sim, 'a' for Android emu
npx expo start --web       # Fastest turnaround for web-like testing
```

See [Mobile App SETUP](/apps/mobile/SETUP.md) for prerequisites (Node 18+, Xcode/Android Studio optional for simulators).

### Shared Core Tests
```bash
cd packages/core
npm install
npm test                   # 90+ unit tests; behavior oracle for web/mobile parity
```

### Database & Backend
- **Firestore emulator**: `npm run dev` auto-connects (check `.env.FIRESTORE_EMULATOR_HOST`)
- **Firebase local SDK**: Configured in `src/lib/firebase.ts`; uses `firebase-applet-config.json` (not in git)
- **Express server**: Runs at port 3000 (built into the dev and production bundles)

---

## Project Layout

```
/                          Repository root (web app + backend)
├── src/                   React SPA (web)
│   ├── components/        Reusable UI (layout, modals, lists, primitives)
│   ├── lib/               Data layer (Firestore hooks, permissions, derivations, utils)
│   ├── services/          External integrations (Sheets sync, etc.)
│   ├── test/              Unit tests (60+ .test.tsx files, fixtures)
│   └── views/             Full-page views (routed screens)
├── server.ts              Express backend + Vite middleware
├── functions/api/         Serverless route definitions (GCP Cloud Functions)
├── firestore.rules        Firestore security rules (role-based access control)
├── database.rules.json    Realtime Database rules (Board collaboration)
├── apps/mobile/           React Native + Expo (iOS, Android, web)
│   ├── app/               Expo router (file-based routing)
│   ├── src/               Components & hooks (screens, UI, data)
│   └── package.json       Separate build (React 18.3, Metro)
├── packages/core/         Shared TypeScript (types, permissions, pure derivations)
│   ├── src/               Domain logic (myDay.ts, board.ts, permissions.ts, etc.)
│   ├── test/              Unit tests (20+ .test.ts files)
│   └── package.json       Publishable (not currently on npm)
├── CHANGELOG.md           Detailed commit history (newest first, by month)
├── MIGRATION.md           Mobile native migration status & roadmap
└── GCLOUD_DEPLOYMENT.md   Google Cloud Run deployment guide
```

---

## Recent Changes & Git Context

**Latest commits (mobile Phase 3):**
- ✅ **Mobile Phase 3: Settings** — Profile, roles reference, light/dark/system appearance, team member management (search, approve, edit role, remove access, invite, cancel invite)
- ✅ **Mobile Phase 3: Global Search** — People search, history search, quick actions (new contact, open sign-up form)
- ✅ **Mobile Phase 3: Feedback** — Submit note screen + admin review screen (kind picker, status cycling, archive, delete)
- ✅ **Mobile Phase 3: SignUp** — Public welcome form (name, contact, interests, prayer request)
- ✅ **Mobile Phase 3: Notifications** — Merged personal + broadcast streams, mark as read, set aside
- ✅ **Mobile Phase 3: Gatherings** — Hero stats, "who we've missed", session list with tap-to-mark roster, "coming up" RSVP counts
- ✅ **Mobile Phase 2: Landing** — Home dispatcher by role (Trainee cockpit, Student home with RSVPs, Community reach-out)
- ✅ **Mobile Phase 2: Prayer tab** — Hold prayer sheet, week-grouped cards, burden editing
- ✅ **Mobile Phase 2: People tab** — Contact search, stage filter pills, last-touched sort
- ✅ **Mobile Phase 2: History** — Activity timeline, filter sheet (kind + team member)
- ✅ **Mobile Phase 1** — Shared data layer in `@cisa/core`, auth gating, My Day Expo port

See [CHANGELOG.md](../CHANGELOG.md) for the full 20+ commit narrative and earlier sessions.

---

## Testing & Quality

- **Unit tests**: 60+ web test files, 20+ mobile/core test files
- **Coverage thresholds**: 87.5% lines, 75.5% branches, 81% functions, 85.5% statements (enforced on every build)
- **E2E tests**: Playwright for critical user flows (in `/e2e/`)
- **Firestore rules testing**: 35k+ line test suite verifying role-based security
- **Vitest config**: `jsdom` environment, 15s timeout, coverage via v8

**Before committing:**
```bash
npm run lint               # Catch style + security issues
npm run typecheck          # Strict TypeScript
npm test                   # Unit tests + coverage check
npm run test:e2e           # E2E with Playwright (slower, optional in dev)
```

---

## Deployment

### GCP Cloud Run (Recommended)
```bash
gcloud run deploy campus-hub \
  --source . \
  --platform managed \
  --region us-west2 \
  --allow-unauthenticated \
  --port 3000
```

**What deploys:**
- Static React + server bundle (built by Vite + esbuild)
- Express backend on port 3000
- API routes under `/api/*`

**Secrets** (set in Cloud Run console):
- `FIREBASE_PROJECT_ID`, `GEMINI_API_KEY`, `GROUPME_BOT_ID`, `GROUPME_ACC_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`

See [GCLOUD_DEPLOYMENT.md](../GCLOUD_DEPLOYMENT.md) and [HYBRID_DEPLOYMENT.md](../HYBRID_DEPLOYMENT.md) for details.

### Mobile Distribution
- **Expo EAS Build**: Builds for iOS/Android; signed APK/IPA ready for App Store / Play Store
- **OTA Updates**: Use Expo Updates to push code changes without app store resubmission
- See [Mobile App SETUP](/apps/mobile/SETUP.md) for EAS configuration

---

## Key Files & Quick Refs

| Purpose | Path | Notes |
|---------|------|-------|
| **Permissions** | `@cisa/core/src/permissions.ts` | Role hierarchy, nav items, route gates |
| **My Day logic** | `@cisa/core/src/myday.ts` | Derivations for leaders, task splits, week grouping |
| **Types** | `@cisa/core/src/types.ts`, `src/types.ts` | Domain interfaces (Contact, Task, Prayer, etc.) |
| **Firestore schema** | `firestore.rules` | Collection structure + security rules |
| **Board** | `@cisa/core/src/board.ts` + `src/views/CoordinationNotes.tsx` | Audience logic + Markdown editor |
| **Inbox** | `@cisa/core/src/inbox.ts` | "From the team" derivation (new contacts, interactions, questions) |
| **App entry** | `src/App.tsx` | Router, layout context, modal providers |
| **Mobile nav** | `apps/mobile/app/_layout.tsx` + `app/(tabs)/` | Expo router with auth gate |
| **Server** | `server.ts` | Express + Vite integration, webhook handlers |
| **Changelog** | `CHANGELOG.md` | Historical context (read before making changes) |

---

## Common Workflows

### Adding a Feature to Web & Mobile
1. **Implement pure logic** in `@cisa/core/src/` (no Firebase init, no DOM, no RN imports)
2. **Add unit tests** in `packages/core/test/`
3. **Implement web UI** in `src/components/` or `src/views/`
4. **Implement mobile UI** in `apps/mobile/src/components/` or `apps/mobile/app/`
5. **Update Firestore rules** in `firestore.rules` if needed
6. **Test thoroughly**: `npm test`, `npm run lint`, mobile E2E
7. **Update CHANGELOG.md** with a concise bullet under `[Unreleased]`

### Deploying to Production
1. Merge to main (triggers CI: typecheck, lint, test, build)
2. Run `gcloud run deploy campus-hub ...` to GCP Cloud Run
3. Set environment variables in Cloud Run console
4. Verify Firestore/Auth/APIs are configured
5. **Mobile**: Use Expo EAS to build + sign, submit to App Store / Play Store, or use Expo Go for testing

### Debugging Firestore Issues
- Check `firestore.rules` for role-based denials
- Verify user role in `users/{uid}` doc (field: `role`)
- Use Firestore emulator in dev (`npm run dev`)
- Check browser console for `permission_denied` errors

### Updating Firestore Rules
1. Edit `firestore.rules`
2. Run `npm run test` (includes rules test via `src/test/firestore.rules.test.ts`)
3. Verify rules-test CI workflow passes
4. On production deploy, rules auto-deploy via CI

---

## Troubleshooting

### "permission_denied" errors
- Verify your user record exists in `users/{uid}` with a valid role
- Check `firestore.rules` — the rule may require a higher role (admin, manager, operator)
- Ensure email verification is enabled if required by the rule

### Tests timeout or fail
- Clear `node_modules` and lock files (`rm -rf node_modules && npm install`)
- Rebuild TypeScript (`npm run typecheck`)
- Check setup.ts for mock configuration
- Increase timeout in `vitest.config.ts` if needed (currently 15s)

### Mobile hot reload not working
- Kill Metro and restart: `npx expo start`
- Check `.env` variables in `apps/mobile/.env`
- Verify Firebase config matches root `.env`

### Express server won't start
- Check port 3000 is free (`lsof -i :3000`)
- Verify `firebase-applet-config.json` exists
- Check `.env` for `VITE_FIREBASE_API_KEY` and other required vars

---

## Backlog

No major backlog items for this init. The wiki can be expanded as follows:

- **Board Phase 4**: Implement Board tab on mobile (currently web-only)
- **Conversations**: Direct messaging between roles (mentioned in Phase 2, not yet implemented)
- **Sheets sync**: Bulk export & Google Sheets integration (admin-only, deferred from Phase 2)
- **Gallery**: Photo wall for answered prayers (design concept, not yet built)
- **API console**: Webhook testing UI (mentioned in Settings, left for later)
- **Phone verification**: Phone number validation (identified as missing in Phase 3)

---

## Quick Start for New Engineers

1. Clone repo: `git clone <url>`
2. Install deps: `npm install`
3. Set `.env` (copy `.env.example`, fill in Firebase keys)
4. Run web: `npm run dev` → http://localhost:5173
5. Run tests: `npm test` (should see ~700 tests passing)
6. Pick a task from the issue tracker or CHANGELOG.md "Unreleased" section
7. Create a branch: `git checkout -b feature/your-feature`
8. Code, test, lint: `npm run lint && npm test`
9. Commit with changelog entry in `CHANGELOG.md`
10. Open a PR and let CI verify (typecheck, lint, test, build)

---

**Questions?** Check `CLAUDE.md` for coding discipline guidelines, or inspect recent PRs for patterns.
