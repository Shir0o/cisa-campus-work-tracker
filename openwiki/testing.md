# Testing Guide

This document covers unit tests, component tests, Firestore rules testing, and e2e testing practices for the CISA Campus Work Tracker.

---

## Overview

| Test Type | Tool | Coverage | Scope |
|-----------|------|----------|-------|
| **Unit tests** | Vitest (jsdom) | 81% lines (enforced) | Core logic (`packages/core`, `src/lib`) |
| **Component tests** | Vitest + React Testing Library | Included in 81% | UI behavior (`src/components`, `src/views`) |
| **Firestore rules** | Firestore Emulator + test suite | 35k lines tested | Security rules (`firestore.rules`) |
| **E2E** | Playwright | Manual sampling | Full user flows across browsers |

**Coverage thresholds** (enforced on every build in CI):
- **Lines**: 81% (ratcheting; never lower)
- **Statements**: 81%
- **Functions**: 75%
- **Branches**: 69%

---

## Running Tests Locally

### All Tests
```bash
npm test                    # Vitest + component tests (web + core package)
npm run test:coverage       # Generate coverage report
npm run test:e2e            # Playwright (slower; optional in dev)
npm run typecheck           # TypeScript type checking
npm run lint                # ESLint (TS/TSX + Firestore rules)
```

### Selective Testing
```bash
# Run only core package tests
cd packages/core && npm test

# Run only web tests
npm test -- src/

# Watch mode (auto-rerun on changes)
npm test -- --watch

# Single test file
npm test -- src/test/MyDay.test.tsx

# Filter by pattern
npm test -- --grep "Prayer"
```

### Firestore Rules Testing
```bash
# Requires Firebase emulator running
npm test -- src/test/firestore.rules.test.ts

# View emulator logs
firebase emulator:start --inspect-functions
```

---

## Unit Testing

### Structure

Tests live alongside source files or in dedicated `/test` folders:

```
packages/core/
├── src/
│   ├── permissions.ts
│   ├── myday.ts
│   ├── types.ts
│   └── data/
│       ├── contacts.ts
│       └── prayers.ts
└── test/
    ├── permissions.test.ts    # Pure function logic
    ├── myday.test.ts          # Derivations (leaders, task splits)
    ├── history.test.ts        # Activity filtering/grouping
    └── ...                    # Other domain modules

src/
├── components/
│   ├── MyDay.tsx
│   ├── Prayer.tsx
│   └── Directory.tsx
└── test/
    ├── MyDay.test.tsx         # UI behavior
    ├── Prayer.test.tsx
    └── Directory.test.tsx
```

### Patterns

#### Pure Function Testing
Test `packages/core/src/` functions without Firebase dependency:

```typescript
// packages/core/src/myday.ts
export function leaderByDaysSinceTouched(contacts: Contact[]): Contact | undefined {
  return contacts.reduce((oldest, current) => 
    new Date(current.lastSeen) < new Date(oldest.lastSeen) ? current : oldest
  )
}

// packages/core/test/myday.test.ts
import { describe, it, expect } from 'vitest'
import { leaderByDaysSinceTouched } from '../src/myday'

describe('My Day logic', () => {
  it('returns oldest contact by lastSeen', () => {
    const contacts = [
      { id: '1', name: 'Alice', lastSeen: '2025-01-15T10:00:00Z' },
      { id: '2', name: 'Bob', lastSeen: '2025-01-10T10:00:00Z' }, // Oldest
      { id: '3', name: 'Charlie', lastSeen: '2025-01-20T10:00:00Z' },
    ]
    
    const oldest = leaderByDaysSinceTouched(contacts)
    expect(oldest?.name).toBe('Bob')
  })
  
  it('returns undefined for empty contact list', () => {
    const oldest = leaderByDaysSinceTouched([])
    expect(oldest).toBeUndefined()
  })
})
```

#### Component Testing
Test React UI behavior with mocked data:

```typescript
// src/test/Directory.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Directory } from '../views/Directory'

describe('Directory', () => {
  it('filters contacts by search text', async () => {
    const user = userEvent.setup()
    render(<Directory />)
    
    // Wait for mock data to load
    await screen.findByText('Alice')
    
    const searchInput = screen.getByPlaceholderText('Search...')
    await user.type(searchInput, 'Bob')
    
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
  
  it('disables add contact for viewer role', () => {
    // Mock role as 'viewer'
    render(<Directory />, { role: 'viewer' })
    
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })
})
```

#### Data Layer Testing (Firestore)
Firestore data functions are tested with the emulator or mocked:

```typescript
// packages/core/test/data/contacts.test.ts
import { describe, it, expect, vi } from 'vitest'
import { subscribeContacts } from '../src/data/contacts'

describe('subscribeContacts', () => {
  it('calls onSuccess with contacts list', (done) => {
    const mockDb = {
      collection: vi.fn(() => ({
        onSnapshot: vi.fn((callback) => {
          callback({ docs: [
            { id: '1', data: () => ({ name: 'Alice' } } },
            { id: '2', data: () => ({ name: 'Bob' } } },
          ]})
          return () => {} // unsubscribe
        })
      }))
    }
    
    subscribeContacts(mockDb as any, (contacts) => {
      expect(contacts).toHaveLength(2)
      expect(contacts[0].name).toBe('Alice')
      done()
    })
  })
})
```

---

## Component Testing

### Setup

Tests use:
- **Vitest** as test runner
- **@testing-library/react** for DOM queries and user interactions
- **@testing-library/user-event** for realistic interactions
- **vi.mock()** for module mocking

### Patterns

#### Mocking Firebase
```typescript
// src/test/setup.ts (loaded before all tests)
vi.mock('src/lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      onSnapshot: vi.fn((callback) => {
        callback(mockSnapshot)
        return () => {}
      })
    }))
  }
}))
```

#### Mocking useContext
```typescript
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    useContext: vi.fn((context) => {
      if (context === AuthContext) return { user: { uid: 'test-uid' } }
      return {}
    })
  }
})
```

#### Testing Modal Behavior
```typescript
it('opens modal on button click', async () => {
  const user = userEvent.setup()
  render(<ContactDetailsModal />)
  
  const openButton = screen.getByRole('button', { name: /edit/i })
  await user.click(openButton)
  
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('closes modal on escape key', async () => {
  const user = userEvent.setup()
  render(<ContactDetailsModal open={true} />)
  
  await user.keyboard('{Escape}')
  
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
```

#### Testing Async State Changes
```typescript
it('updates contact on form submit', async () => {
  const user = userEvent.setup()
  render(<ContactForm contactId="123" />)
  
  const nameInput = screen.getByLabelText('Name')
  await user.clear(nameInput)
  await user.type(nameInput, 'New Name')
  
  const submitButton = screen.getByRole('button', { name: /save/i })
  await user.click(submitButton)
  
  // Wait for async update
  await expect(screen.findByText(/saved/i)).resolves.toBeInTheDocument()
})
```

---

## Firestore Rules Testing

### Overview

`src/test/firestore.rules.test.ts` is a 35k-line suite that validates security rules without making real Firebase calls.

**Runs only if** the Firebase Emulator is available (gated by `process.env.FIRESTORE_EMULATOR_HOST`).

### Structure

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initializeTestEnvironment, RulesTestContext } from '@firebase/rules-unit-testing'

describe('Firestore Rules', () => {
  let testEnv: RulesTestContext
  
  beforeAll(async () => {
    // Load rules from firestore.rules file
    testEnv = await initializeTestEnvironment({
      projectId: 'campus-hub-test',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      }
    })
  })
  
  afterAll(async () => {
    await testEnv.cleanup()
  })
  
  describe('User role permissions', () => {
    it('viewer can read users collection', async () => {
      const db = testEnv.authenticatedContext('viewer-uid', {
        email: 'viewer@example.com',
        email_verified: true,
        custom: { role: 'viewer' }
      }).firestore()
      
      await expect(
        db.collection('users').get()
      ).toAllow()  // Rule: isApprovedUser() can list users
    })
    
    it('viewer cannot create contacts', async () => {
      const db = testEnv.authenticatedContext('viewer-uid', {
        custom: { role: 'viewer' }
      }).firestore()
      
      await expect(
        db.collection('contacts').add({ name: 'Test', email: 'test@example.com' })
      ).toDeny()  // Rule: only isManager() can create
    })
  })
  
  describe('Board doc audience visibility', () => {
    it('manager sees all board docs', async () => {
      const managerDb = testEnv.authenticatedContext('manager-uid').firestore()
      
      await expect(
        managerDb.collection('boardDocs').get()
      ).toAllow()
    })
    
    it('operator sees only team+ audience docs', async () => {
      const operatorDb = testEnv.authenticatedContext('operator-uid').firestore()
      
      // Querying docs where audience != 'team' (trainee+ and everyone)
      await expect(
        operatorDb.collection('boardDocs').where('audience', '!=', 'team').get()
      ).toAllow()
    })
  })
})
```

### Key Assertions

```typescript
// Allow read/write
await expect(db.collection('prayers').get()).toAllow()
await expect(db.collection('prayers').add({...})).toAllow()

// Deny read/write
await expect(db.collection('payments').get()).toDeny()
await expect(db.collection('users/{uid}/secret').set({...})).toDeny()
```

### Common Test Patterns

#### Role-based Access
```typescript
// Verify that only admin can update user roles
it('admin can update user role', async () => {
  const adminDb = testEnv.authenticatedContext('admin-uid', {
    custom: { role: 'admin' }
  }).firestore()
  
  await expect(
    adminDb.collection('users').doc('other-uid').update({ role: 'manager' })
  ).toAllow()
})

it('operator cannot update user role', async () => {
  const operatorDb = testEnv.authenticatedContext('operator-uid', {
    custom: { role: 'operator' }
  }).firestore()
  
  await expect(
    operatorDb.collection('users').doc('other-uid').update({ role: 'manager' })
  ).toDeny()
})
```

#### Ownership Checks
```typescript
it('user can update own profile', async () => {
  const db = testEnv.authenticatedContext('alice-uid').firestore()
  
  await expect(
    db.collection('users').doc('alice-uid').update({ displayName: 'Alice Smith' })
  ).toAllow()
})

it('user cannot update other user profile', async () => {
  const db = testEnv.authenticatedContext('alice-uid').firestore()
  
  await expect(
    db.collection('users').doc('bob-uid').update({ displayName: 'Bob Hacker' })
  ).toDeny()
})
```

#### Field-level Validation
```typescript
it('feedback kind must be one of predefined values', async () => {
  const db = testEnv.authenticatedContext('user-uid').firestore()
  
  // Valid
  await expect(
    db.collection('feedback').add({
      kind: 'thought',
      message: 'Nice app!'
    })
  ).toAllow()
  
  // Invalid
  await expect(
    db.collection('feedback').add({
      kind: 'invalid-kind',
      message: 'Bad!'
    })
  ).toDeny()
})
```

---

## E2E Testing with Playwright

### Setup

```bash
npm run test:e2e
```

Configured in `playwright.config.ts`:
- Browser: Chromium + Firefox
- Base URL: `http://localhost:5173` (Vite dev server)
- Screenshots on failure
- Retry failed tests once

### E2E Test Structure

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('user can sign up and create a contact', async ({ page }) => {
    // 1. Navigate to sign-up
    await page.goto('/')
    await page.click('text=Sign up')
    
    // 2. Fill form
    await page.fill('input[name="name"]', 'John Doe')
    await page.fill('input[name="email"]', 'john@example.com')
    await page.click('text=Submit')
    
    // 3. Wait for success
    await expect(page).toHaveURL(/\/login/)
    
    // 4. Log in (test account pre-seeded with `npm run seed:e2e-users`)
    await page.fill('input[type="email"]', 'operator@test.com')
    await page.fill('input[type="password"]', 'test1234')
    await page.click('text=Sign In')
    
    // 5. Verify dashboard loads
    await expect(page).toHaveTitle(/My Day|Home/)
  })
})
```

### Test Users

Four test users pre-seeded in CI (via `scripts/seed-test-user-docs.ts`):

| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| admin@test.com | test1234 | admin | Full system access |
| manager@test.com | test1234 | manager | Team lead flows |
| operator@test.com | test1234 | operator | Day-to-day staff |
| viewer@test.com | test1234 | viewer | Guest access |

```bash
npm run seed:e2e-users  # Create test users (run once in new Firestore instance)
```

### Common Patterns

#### Testing Role-gated Flows
```typescript
test('operator can add contact; viewer cannot', async ({ page }) => {
  // Log in as operator
  await loginAs(page, 'operator@test.com')
  
  // Add button exists
  await expect(page.locator('text=Add Contact')).toBeVisible()
  
  // Log out
  await page.click('button[aria-label="Logout"]')
  
  // Log in as viewer
  await loginAs(page, 'viewer@test.com')
  
  // Add button does NOT exist
  await expect(page.locator('text=Add Contact')).not.toBeVisible()
})
```

#### Testing Real-time Updates
```typescript
test('contact updates appear in directory instantly', async ({ browser }) => {
  // Open two browser contexts (simulating two users)
  const ctx1 = await browser.newContext()
  const page1 = await ctx1.newPage()
  
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  
  // User 1: Add a contact
  await loginAs(page1, 'operator@test.com')
  await page1.click('text=Add Contact')
  await page1.fill('input[name="name"]', 'Test Person')
  await page1.click('text=Save')
  
  // User 2: Sees it in real-time
  await loginAs(page2, 'operator@test.com')
  await page2.goto('/directory')
  await expect(page2.locator('text=Test Person')).toBeVisible()
})
```

---

## Coverage & Enforcement

### Coverage Report
```bash
npm run test:coverage
```

Generates HTML report in `coverage/` directory. Open `coverage/index.html` in browser.

### Coverage Thresholds

Set in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      lines: 81,        // 81% or higher
      statements: 81,
      functions: 75,
      branches: 69,
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        'src/test/**',
        'packages/core/test/**',
        'apps/mobile/**'  // Mobile tested separately
      ]
    }
  }
})
```

**Never lower thresholds.** If a new feature drops coverage:
1. Write more tests
2. Refactor to make code more testable
3. If code is untestable, move to core (`packages/core`) where it can be unit-tested

### CI Enforcement

`.github/workflows/test.yml` runs on every PR:
```yaml
- name: Run tests
  run: npm test
  
- name: Check coverage
  run: npm run test:coverage
  # Fails if coverage < thresholds
```

---

## Debugging Tests

### Debug a Single Test
```bash
npm test -- src/test/MyDay.test.tsx --reporter=verbose
```

### Watch Mode
```bash
npm test -- --watch

# Run only failing tests
npm test -- --reporter=verbose
```

### Inspect DOM During Test
Use `screen.debug()` to print DOM state:

```typescript
it('renders contact list', async () => {
  render(<Directory />)
  
  await screen.findByText('Alice')
  
  // Print DOM for debugging
  screen.debug()
  
  // Or just part of it
  screen.debug(screen.getByRole('list'))
})
```

### Firestore Rules Debugging
```bash
firebase emulator:start --inspect-functions
```

Check emulator logs for rule deny reasons.

---

## Mobile Testing

Mobile tests are separate (different build target):

```bash
cd apps/mobile
npm test

# Or as part of monorepo
npm test -- apps/mobile
```

Mobile tests use:
- **Vitest** + **React Native Testing Library**
- Same coverage thresholds as web (81%)
- No Playwright (use Expo EAS for build testing)

---

## Best Practices

### Do
✅ Test behavior, not implementation  
✅ Use `screen.getByRole()` over `getByTestId()`  
✅ Test user flows end-to-end when possible  
✅ Mock external APIs (Gemini, GitHub)  
✅ Keep tests focused and small  
✅ Use descriptive test names  

### Don't
❌ Test internal state or props directly  
❌ Snapshot-test large components (brittle)  
❌ Over-mock (defeats the purpose)  
❌ Ignore flaky tests; fix them  
❌ Skip tests for "simple" code  

---

## Troubleshooting

### "Cannot find module 'xyz'"
```bash
rm -rf node_modules package-lock.json
npm install
npm run typecheck
```

### Firestore emulator won't start
```bash
# Check if running
lsof -i :8080

# Kill process
kill -9 <pid>

# Start fresh
firebase emulator:start --only firestore
```

### Coverage threshold failing
1. Run `npm run test:coverage` locally
2. Open `coverage/index.html`
3. Find untested files/branches
4. Add tests for those paths
5. Never lower the threshold

---

## Next Steps

- See **[Testing Workflow](/openwiki/workflows.md#testing-workflow)** for test patterns during development
- See **[Firebase Setup](/openwiki/firebase-setup.md)** for rule testing details
- Check `CLAUDE.md` for code discipline guidelines on testing
