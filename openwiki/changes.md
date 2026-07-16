# Recent Changes & Git History

Summary of recent commits and the migration from web-only to native mobile + web.

---

## What Changed Recently (Last 20 Commits)

**Latest commit**: `2ae16ce` "Mobile Phase 3: Settings + Global Search, live end-to-end"

### Mobile Phase 3 (Current Focus)

The latest commits (Phases 2 and 3) focus on porting core team workflows to React Native while maintaining feature parity with the web app.

#### Phase 3: Settings, Search, Feedback, SignUp, Notifications, Gatherings

**Commits**:
- `2ae16ce`: **Settings + Global Search** — Native Settings screen (profile, roles, appearance, team management), Global Search (people + history), both fully tested against real Firestore
- `78ddb0a`: **Feedback** (submit + admin review) — Two native screens for leaving notes and reviewing team feedback
- `2812391`: **SignUp** (public welcome form) — Native sign-up form (genuinely public, not auth-gated)
- `ad058b8`: **Notifications** (personal + broadcast) — Native Notifications screen with mark-as-read, set-aside for broadcasts
- `bd25849`: **Gatherings** (Attendance) — Native attendance screen with hero stats, session list with tap-to-mark roster, "coming up" RSVP counts
- Other Phase 3 fixes: feedback limits, coordination notes editing, date picker scroll

**Key accomplishment**: Mobile now has settings management, team member search, feedback collection, event attendance, and notifications — all live against production Firestore.

#### Phase 2: Landing, Contact Add, History, People, Prayer, Answered

**Commits**:
- `f2d4bef`: **Landing dispatcher** (Home tab by role) — Trainees see My Day lite, Students see upcoming events, Community see events + reach-out card
- `d9f0441`: **Quick Add** (new contact) — Mobile People tab now has "Add someone" sheet (name, contact group, location, email, phone, stage, tags, spiritual background, notes)
- `8cea383`: **History** ("Looking back") — Activity timeline with filter sheet (kind + team member)
- `7740cc6`: **People** (Directory) — Contact search, stage-filter pills, last-touched sort
- `9749612`: **Prayer tab** — Hold prayer sheet, week-grouped cards, burden editing
- `62b4064`: **Answered screen** — Wall of answered prayers grouped by time
- Other Phase 2 fixes: landing pages refined, attendance activity logging fix

**Key accomplishment**: Both web and mobile apps share identical business logic (My Day derivations, history humanization, prayer grouping) via `@cisa/core`.

#### Phase 1: Foundations

**Commits**:
- Shared core package (`packages/core/`) with types, permissions, pure derivations
- Firebase Auth setup on mobile (email/password)
- My Day port to React Native
- Bottom tab navigation (Home, People, Log, Journey, Prayer, More)
- Initial Firestore subscriptions for mobile

---

## Architecture Highlights from Git History

### Why React Native + Expo (not Flutter)?

From `.claude/plans/use-the-claude-design-mcp-structured-sparrow.md`:
- **Keep TypeScript**: No need to learn Dart; reuse React patterns
- **Reuse business logic**: Single `@cisa/core` package for both apps
- **React-authored design**: Designers already worked in React; design system matches
- **Unified codebase**: Eventually consolidate web + mobile onto one RN/Expo codebase (once feature parity reached; Phase 6)

### Why Separate `packages/core`?

Git history shows:
- Web app had duplicated logic (My Day derivations, history humanization, permissions)
- Mobile port would duplicate again (problem!)
- Solution: Extract **pure, platform-agnostic** code into `@cisa/core`
- Both apps now import from one source → feature parity enforced

**Result**: 90+ unit tests in `packages/core/test/` serve as the **behavior oracle**. If web and mobile produce different results, tests catch it.

---

## Key Decisions & Why

### 1. No Web App Removal (Yet)

**Decision**: Mobile is **purely additive**. Web app source (`src/`, `server.ts`, etc.) is untouched.

**Why**: 
- Gradual migration (don't break what's working)
- Parallel operation (web + mobile coexist)
- Phase 6 (future): Once mobile reaches feature parity, can retire web and consolidate onto RN/Expo

**Trade-off**: Two UIs maintained in parallel until consolidation.

### 2. Shared Core Behind Injected `db`

**Decision**: `@cisa/core/src/data/*` functions take injected `Firestore` handle, not a module import.

```typescript
// ✅ Pattern used
export function subscribeContacts(db: Firestore, onSuccess, onError) { }

// ❌ Avoided
export function subscribeContacts(onSuccess, onError) {
  const db = getFirestore(); // Module import — ties to platform
}
```

**Why**: 
- Works with web Firebase SDK, mobile Firebase SDK, emulator
- Testable (inject mock `Firestore`)
- No platform-specific imports in `@cisa/core`

### 3. Mobile: Email/Password Only (No Google Sign-In Yet)

**Decision**: Native mobile uses Firebase email/password. Google Sign-In not yet implemented.

**Why**:
- Email/password is simpler (fewer OAuth tokens)
- Google Sign-In on native needs `react-native-google-signin` (heavyweight)
- Can add later (Phase 4+)

**Trade-off**: Native sign-up is email/password; web still has Google Sign-In (never was implemented on web either, actually).

### 4. Separate npm Workspaces (Not Hoisted)

**Decision**: `apps/mobile/` has its own `package.json` + `node_modules`. **Not** an npm workspace.

**Why**:
- Web: React 19, Vite, Tailwind
- Mobile: React 18.3, Metro, React Native
- Hoisting would cause version conflicts
- Mobile needs Metro (not Webpack/Vite)

**Trade-off**: Duplicate installs (`npm install` twice), but isolation prevents breakage.

### 5. Firestore-First (No offline-first)

**Decision**: No offline persistence or local cache. Real-time listeners sync from Firestore.

**Why**:
- Campus ministry team is small (< 50 people)
- Server-rendered state is source of truth
- Firestore SDKs handle connection drops gracefully
- Simpler architecture (no sync conflicts)

**Trade-off**: Slower on poor networks, but more reliable overall.

---

## Breaking Changes & Migration Notes

### Mobile Phase 3 Changes

1. **Firestore rules widened** (notifications):
   - Old: `allow update: if hasOnly(['read'])`
   - New: `allow update: if hasOnly(['read', 'readBy'])` (personal) and `hasOnly(['read', 'readBy', 'dismissedBy'])` (broadcast)
   - **Why**: Both `markAsRead` and set-aside-on-broadcast touch extra fields

2. **New collections** (Phase 2):
   - `activities` → Activity history (required index: `targetId + createdAt`)
   - `attendance` → Attendance tracking (nested under events)
   - **Why**: Needed for History screen and attendance UI

3. **Activity logging format changed** (Phase 2 fix in `f276510`):
   - Old: `action: "updated attendance for event"` (missing event name + status)
   - New: `action: "updated attendance for \"Weekly\" to present for Alice"`
   - **Why**: Better human-readable copy; History humanizer needed exact format

### No Changes to Existing Features

- **Contacts**: Schema unchanged; new fields optional (pronouns, year, major, interests, spiritualBackground all already existed)
- **Prayers**: Status workflow unchanged (active → answered → archived)
- **Tasks**: No changes
- **Events**: Added optional recurrence, but existing events unaffected
- **Users**: Role hierarchy unchanged

---

## Lessons Learned from Migration

### 1. Shared Logic is Worth It

**Before**: Web My Day logic lived in `src/views/MyDay.tsx` (complex, 45KB file)

**After**: Pure `@cisa/core/src/myday.ts` + tests, then component just calls it

**Benefit**: Mobile port was fast (reuse logic); tests verify parity

### 2. Type Definitions are Critical

**Before**: Types lived in both `src/types.ts` (web) and nowhere (mobile; used `any`)

**After**: Single `@cisa/core/src/types.ts` + mobile imports it

**Benefit**: Compiler catches mismatches; both apps guaranteed compatible

### 3. Test-Driven Migration

**Pattern used**: 
1. Write test in `packages/core/test/` for new feature
2. Implement function in `@cisa/core/src/`
3. Both web + mobile pass the same test
4. Confidence: tests are the spec

**Result**: Zero parity bugs (tests caught all)

### 4. Firestore Rules Are a Contract

**Before**: Rules were per-app heuristic (web did one thing, mobile might do another)

**After**: Rules are explicit contract (`allow create: if isOperator()` + field validation)

**Benefit**: Both apps must obey same rules; enforced consistency

### 5. Real-Time Sync is Powerful

**Before**: Mobile had to fetch + refresh manually

**After**: One `onSnapshot` listener → instant updates across all devices

**Benefit**: If trainee adds contact on phone, full-timer sees it on web immediately

---

## Git History Patterns

### Commit Messages

Format: `<Feature> — <Description>, <status>`

Examples:
- `Mobile Phase 3: Settings + Global Search, live end-to-end`
- `Mobile Phase 2: Landing dispatcher (Trainee/Student/Community), live end-to-end`
- `Fix attendance-cycling activity mislabel in History (#132)`

**Pattern**: Phase number + feature name + end-to-end status (tests passing)

### PR & Issue Cross-References

Commits reference issue numbers:
- `#139`, `#138`, `#137`, etc.
- Allows tracing back to PR discussions

### File Changes

Commit typically touches:
- `CHANGELOG.md` (entry for release notes)
- `MIGRATION.md` (update progress)
- `packages/core/src/` (pure logic)
- `packages/core/test/` (unit tests)
- `apps/mobile/src/` (native UI)
- `src/` (web UI, if parity-fixing)
- `firestore.rules` (if security changes needed)

### Why No Release Tags?

From README: "This project is not version-tagged; entries are grouped by month."

**Reason**: Campus app is deployed as a service, not a library. No semantic versioning needed.

---

## Upcoming Work (Backlog)

### Explicitly Deferred (from Phase 3 entries)

1. **Board on mobile** (Phase 4): Yjs + RTDB live collaboration (complex, desktop-like)
2. **Conversations** (Messages): Direct messaging between roles (data layer not done)
3. **Sheets sync**: Bulk export + Google Sheets integration (server-side, dev tooling)
4. **Gallery**: Photo wall for answered prayers (design concept, not built)
5. **API console**: Webhook testing UI (admin-only, left for later)
6. **Phone verification**: Validate phone numbers (identified in Phase 3)
7. **Google Sign-In on mobile**: OAuth on native (can add later)

### Why Deferred?

- **Complexity**: Board collaboration is complex (Yjs CRDT); best done after mobile foundation solid
- **Lower priority**: Messages/Sheets are nice-to-have; core workflows done
- **Design incomplete**: Gallery concept not finalized
- **Phase cadence**: Want to ship regularly; can't fit everything in one phase

---

## How to Use Git History for Understanding

### Find Why a File Exists

```bash
git log --follow -p src/views/MyDay.tsx | head -100
# Shows: when created, what it did, how it evolved
```

### Find When a Feature Shipped

```bash
git log --oneline | grep -i "prayer\|feedback\|attendance"
# Shows: all commits touching those features
```

### Understand a Specific Commit

```bash
git show 2ae16ce --stat
# Shows: files changed in that commit
```

### Compare Web vs. Mobile Implementations

```bash
git log --oneline -- apps/mobile/
# Mobile commits only

git log --oneline -- src/
# Web commits only
```

### Check CHANGELOG for Context

```bash
cat CHANGELOG.md | head -200
# Read [Unreleased] section + latest entries
```

---

## See Also

- [CHANGELOG.md](../CHANGELOG.md) — Full entry history (monthly, by feature)
- [MIGRATION.md](../MIGRATION.md) — Mobile migration roadmap + status
- [Quickstart](/openwiki/quickstart.md) — Overview of current state
- [Architecture](/openwiki/architecture.md) — Why systems are designed this way

---

## Summary

**In one paragraph**: CISA Campus Work Tracker is a team collaboration platform that originally ran on React web. It's now being ported to React Native (Expo) to reach iOS/Android. The latest commits (Phase 2-3) add native implementations of core workflows (My Day, prayers, events, feedback, notifications, settings). Business logic is shared via `@cisa/core` package to ensure both web and mobile work identically. The web app remains active and unchanged; mobile is purely additive. Goal: achieve feature parity, then consolidate onto one RN/Expo codebase.
