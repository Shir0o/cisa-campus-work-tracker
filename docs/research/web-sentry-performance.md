# Research: Web Sentry Performance Configuration & Router Tracing

## Status & Ownership
- **Issue**: [#1679](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1679) — *Research Web Sentry Performance configuration and router tracing*
- **Parent Issue**: [#1677](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1677) — *Map: Daily performance & quality metrics pipeline (Web, PWA, Mobile)*
- **Blocks**: [#1682](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1682) — *Instrument Sentry Performance on Web and PWA*
- **Date**: October 2026
- **Target Platform**: Web & PWA (Vite 8, React 19, React Router v7, Firebase Firestore)

---

## 1. Executive Summary

This document establishes the architecture and configuration guidelines for instrumenting `@sentry/react` within the web and PWA client of `cisa-campus-work-tracker`. 

The key architectural decisions are:
1. **Routing Integration**: Using `@sentry/react`'s `reactRouterV7BrowserTracingIntegration` combined with `withSentryReactRouterV7Routing` to trace route transitions and browser performance for declarative `<Routes />` in `src/App.tsx`.
2. **Core Web Vitals**: Automatic ingestion of Core Web Vitals (Largest Contentful Paint [LCP], Interaction to Next Paint [INP], and Cumulative Layout Shift [CLS]) via browser `PerformanceObserver` APIs built into Sentry's browser tracing integration.
3. **Sampling Strategy**: Inert by default without `VITE_SENTRY_DSN`. `tracesSampleRate: 1.0` in local development (when explicitly configured), and `0.2` (20%) in production to maintain strict quota discipline and parity with the mobile application (`apps/mobile/src/lib/sentry.ts`).
4. **Strict Legal & Privacy Compliance (AGENTS.md Rule 6)**:
   - **Session Replay strictly prohibited**: Zero inclusion of `@sentry/replay` or `replayIntegration()`, eliminating California Invasion of Privacy Act (CIPA) wiretapping risks.
   - **PII Scrubbing**: `sendDefaultPii: false`, scrubbing of all form inputs, URLs, and console statements via `beforeBreadcrumb`, and restricting user tracking strictly to opaque Firebase `uid`s (never emails or names).
5. **Custom Firestore Instrumentation**: Safe, lightweight span wrappers (`measureFirestore`) around Firestore point queries, mutations, and initial `onSnapshot` deliveries, with zero overhead in test/DSN-less environments.

---

## 2. Primary Sources & Citations

1. **Sentry React SDK & Browser Tracing**:
   - Official Sentry Documentation: [Sentry React SDK Configuration](https://docs.sentry.io/platforms/javascript/guides/react/)
   - Official Sentry Tracing Documentation: [Set Up Performance Tracing in React](https://docs.sentry.io/platforms/javascript/guides/react/performance/)
2. **React Router v7 Tracing Integration**:
   - Sentry React Router Integration Guide: [Sentry React Router v7 Integration](https://docs.sentry.io/platforms/javascript/guides/react/configuration/integrations/react-router/)
   - Package reference: `@sentry/react` (v8/v9 unified SDK architecture).
3. **Core Web Vitals Specification**:
   - Google Web Vitals Guidelines: [Web Vitals Overview (LCP, INP, CLS)](https://web.dev/explore/metrics)
   - Sentry Web Vitals Guide: [Capturing Core Web Vitals in Sentry](https://docs.sentry.io/product/insights/frontend/web-vitals/)
4. **Existing Codebase Conventions**:
   - Mobile Sentry Configuration: [`apps/mobile/src/lib/sentry.ts`](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/add_performance_metrics_dashboard/apps/mobile/src/lib/sentry.ts)
   - Legal & Regulatory Compliance Policy: [`AGENTS.md`](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/add_performance_metrics_dashboard/AGENTS.md) (Section 6: Legal & Regulatory Compliance - CIPA / Wiretapping & Privacy)
   - Router & Routing Setup: [`src/App.tsx`](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/add_performance_metrics_dashboard/src/App.tsx)
   - Firebase Initialization: [`src/lib/firebase.ts`](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/add_performance_metrics_dashboard/src/lib/firebase.ts)

---

## 3. Vite SPA & React Router v7 Tracing Architecture

### 3.1 Current Codebase State
- **React**: `^19.3.0`
- **React Router**: `react-router-dom: ^7.18.3`
- **Bundler**: `vite: ^8.3.3`
- **Routing Paradigm**: The app in `src/App.tsx` uses declarative JSX `<BrowserRouter>` wrapping context providers (`AuthProvider`, `LanguageProvider`, `NavShellProvider`) and `<Routes>`.

### 3.2 Required Dependencies
To enable Sentry Performance on Web/PWA:
```bash
npm install @sentry/react
npm install --save-dev @sentry/vite-plugin
```

> [!IMPORTANT]
> Do NOT install `@sentry/replay` or `@sentry/browser`. All required browser tracing integrations, Web Vitals, and span APIs are bundled directly within `@sentry/react`.

### 3.3 Sentry Web Initialization Module (`src/lib/sentry.ts`)
To mirror the cleanly isolated, fail-safe pattern established in [`apps/mobile/src/lib/sentry.ts`](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-tracker/add_performance_metrics_dashboard/apps/mobile/src/lib/sentry.ts), create a dedicated `src/lib/sentry.ts` module:

```typescript
import * as Sentry from '@sentry/react';
import React from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

let isInitialized = false;

/**
 * Initialize Sentry for Web & PWA.
 * Safe to call multiple times; no-op if VITE_SENTRY_DSN is unset.
 */
export function initSentry(): void {
  if (isInitialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE || 'production',
      release: import.meta.env.VITE_APP_VERSION,
      
      // Privacy & compliance: strictly avoid collecting default PII
      sendDefaultPii: false,

      // Performance Monitoring & React Router v7 Browser Tracing
      integrations: [
        Sentry.reactRouterV7BrowserTracingIntegration({
          useEffect: React.useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      ],

      // Sampling rate configuration
      tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,

      // PII Scrubbing Hooks (see Section 6)
      beforeBreadcrumb(breadcrumb) {
        // Strip sensitive user input from UI interactions
        if (breadcrumb.category === 'ui.click' || breadcrumb.category === 'ui.input') {
          if (breadcrumb.data) {
            delete breadcrumb.data.value;
            delete breadcrumb.data.text;
          }
        }
        return breadcrumb;
      },

      beforeSend(event) {
        // Guarantee user context is limited to opaque UID
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
        }
        return event;
      },
    });

    isInitialized = true;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to initialize Sentry:', err);
    }
  }
}

/** Check if Sentry is active */
export function isSentryActive(): boolean {
  return isInitialized;
}
```

### 3.4 Hooking into `src/App.tsx`
In `src/App.tsx`, wrap the declarative `<Routes>` element using Sentry's HOC:
```tsx
import * as Sentry from '@sentry/react';

// Create instrumented routes wrapper
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NavShellProvider>
          <Router>
            <AuthProvider>
              <LanguageProvider>
                ...
                {/* Replace <Routes> with <SentryRoutes> */}
                <SentryRoutes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/contacts" element={<ProtectedRoute><Directory /></ProtectedRoute>} />
                  <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
                  ...
                </SentryRoutes>
              </LanguageProvider>
            </AuthProvider>
          </Router>
        </NavShellProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
```

### 3.5 App Entrypoint (`src/main.tsx`)
Initialize Sentry before rendering the React tree:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initSentry } from './lib/sentry';

// Initialize Sentry early (inert if VITE_SENTRY_DSN is absent)
initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### 3.6 Vite Source Maps Configuration (`vite.config.ts`)
To allow Sentry to de-minify stack traces in production error and performance transaction reports without exposing source code publicly:
```typescript
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Only upload sourcemaps when SENTRY_AUTH_TOKEN is present in CI
    process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            assets: './dist/**',
          },
        })
      : null,
  ],
  build: {
    sourcemap: !!process.env.SENTRY_AUTH_TOKEN, // Generate sourcemaps only for Sentry release builds
  },
});
```

---

## 4. Core Web Vitals & Transaction Monitoring

### 4.1 How Web Vitals are Captured
Sentry's `browserTracingIntegration` automatically registers browser `PerformanceObserver` instances during initialization. It captures the modern Core Web Vitals:
1. **LCP (Largest Contentful Paint)**: Loading benchmark measuring when main visual viewport elements finish painting. Target: $\le 2.5\text{s}$.
2. **INP (Interaction to Next Paint)**: Responsiveness benchmark tracking the slowest user interaction latency over the page session (replaces legacy FID). Target: $\le 200\text{ms}$.
3. **CLS (Cumulative Layout Shift)**: Visual stability benchmark quantifying unexpected visual layout shifts during render. Target: $\le 0.1$.
4. **Supporting Metrics**:
   - **TTFB (Time to First Byte)**: Backend/CDN response latency.
   - **FCP (First Contentful Paint)**: Initial DOM render time.

### 4.2 Parameterized Route Names vs URL Paths
A major benefit of `reactRouterV7BrowserTracingIntegration` is **parameterized transaction naming**:
- Instead of generating distinct transactions for every contact ID (e.g., `/contact/12345` vs `/contact/67890`), Sentry normalizes transactions to `/contact/:id`.
- This prevents:
  1. High transaction cardinality that dilutes Sentry aggregation and blows quota.
  2. PII leakage where user IDs, email addresses, or query parameters are embedded in transaction titles.

---

## 5. Sampling Strategy & Quota Management

### 5.1 Environment Recommendations

| Environment | Rate (`tracesSampleRate`) | Rationale |
| :--- | :--- | :--- |
| **Development** (`import.meta.env.DEV`) | `1.0` (100%) | Guarantees developers can inspect custom Firestore spans and navigation transactions locally when testing with a dev DSN. |
| **CI / Vitest** | `0.0` (Inert) | `VITE_SENTRY_DSN` is empty; SDK does not initialize; zero test overhead or external network calls. |
| **Production** | `0.2` (20%) | Captures sufficient statistical volume for Core Web Vitals and p75/p95 latency metrics while maintaining quota parity with `apps/mobile/src/lib/sentry.ts`. |

### 5.2 Dynamic Sampling via `tracesSampler` (Optional Enhancement)
For fine-grained control as traffic scales, Sentry provides `tracesSampler`:
```typescript
tracesSampler: (samplingContext) => {
  if (import.meta.env.DEV) return 1.0;

  const transactionName = samplingContext.transactionContext.name;

  // Drop noise and health checks
  if (transactionName.includes('/health') || transactionName.includes('manifest.json')) {
    return 0.0;
  }

  // Sample critical workflows at higher priority (e.g. auth, attendance, contact creation)
  if (transactionName.startsWith('/attendance') || transactionName.startsWith('/contacts')) {
    return 0.25;
  }

  // Baseline sample rate for other views
  return 0.1;
}
```

---

## 6. Privacy, Legal Compliance & CIPA Safeguards

### 6.1 Strict Prohibition of Session Replay (AGENTS.md Rule 6)
`AGENTS.md` explicitly mandates:
> **CIPA / Wiretapping (Session Replay)**: Do not add session recording/replay scripts (Clarity, FullStory, LogRocket) without explicit opt-in. Mask all input fields at the capture layer.

Furthermore, map issue [#1677](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1677) lists session replay under **Out of scope**:
> *Session replay and screen recording scripts (CIPA / Wiretapping violation under AGENTS.md)*

**Enforcement:**
- **NEVER** install `@sentry/replay`.
- **NEVER** add `Sentry.replayIntegration()` or `replaysSessionSampleRate` / `replaysOnErrorSampleRate`.
- Verification: Automated CI check or bundle inspection to verify no replay workers or scripts are included.

### 6.2 Preventing PII Leakage in Breadcrumbs & Tags
The app handles sensitive campus ministry data: personal contact details, phone numbers, addresses, prayer requests, and pastoral notes. Under no circumstances may this information leak into Sentry.

1. **Default PII Disablement**:
   ```typescript
   sendDefaultPii: false,
   ```
   Prevents Sentry from automatically recording client IP addresses, session cookies, or device serial numbers.

2. **Breadcrumb Scrubbing (`beforeBreadcrumb`)**:
   Sentry UI click breadcrumbs capture DOM node contents. Ensure all input field values, search queries, and note contents are redacted:
   ```typescript
   beforeBreadcrumb(breadcrumb) {
     // Redact form inputs and text entries
     if (breadcrumb.category === 'ui.click' || breadcrumb.category === 'ui.input') {
       if (breadcrumb.data) {
         delete breadcrumb.data.value;
         delete breadcrumb.data.text;
       }
     }
     // Scrub tokens and parameters in fetch / XHR URLs
     if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
       if (breadcrumb.data?.url) {
         try {
           const parsed = new URL(breadcrumb.data.url, window.location.origin);
           parsed.search = ''; // Strip all query params
           breadcrumb.data.url = parsed.toString();
         } catch {
           // fallback if URL parsing fails
         }
       }
     }
     return breadcrumb;
   }
   ```

3. **User Identity Governance (Parity with Mobile)**:
   In `apps/mobile/src/lib/sentry.ts`:
   ```typescript
   export function captureFirestoreError(info: {
     error: string;
     operationType: string;
     path: string | null;
     userId?: string | null | undefined;
     email?: string | null | undefined;
   }): void {
     if (!Sentry) return;
     Sentry.captureException(new Error(info.error), {
       tags: {
         operationType: info.operationType,
         path: info.path ?? '',
         userId: info.userId ?? '', // Opaque UID ONLY
       },
     });
   }
   ```
   The web implementation must strictly enforce this:
   - When calling `Sentry.setUser({ id: user.uid })`, never include `email`, `username`, or `ip_address`.
   - Strip any accidental user fields in `beforeSend`:
     ```typescript
     beforeSend(event) {
       if (event.user) {
         delete event.user.email;
         delete event.user.username;
         delete event.user.ip_address;
       }
       return event;
     }
     ```

4. **Self-Hosted Bundling (No External CDNs)**:
   Per AGENTS.md Rule 6 (*"Self-host web fonts and static resources locally; do not link remote CDNs"*), `@sentry/react` must be bundled locally into the application bundle via Vite and npm, never loaded via a remote script tag (`<script src="https://browser.sentry-cdn.com/...">`).

---

## 7. Custom Spans for Firestore Latency

### 7.1 Objective & Requirements
Firestore latency is the primary driver of perceived user performance in `cisa-campus-work-tracker`. We need to instrument:
1. **Point Reads** (`getDoc`, `getDocs`, `getDocFromServer`): Op `db.query`.
2. **Point Writes** (`setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `writeBatch.commit`): Op `db.mutation`.
3. **Realtime Subscriptions** (`onSnapshot`): Op `db.subscribe`, measuring time-to-first-data.

### 7.2 Custom Span Helper Implementation (`src/lib/sentry.ts`)
```typescript
import * as Sentry from '@sentry/react';

export interface FirestoreSpanOptions {
  op: 'db.query' | 'db.mutation' | 'db.subscribe';
  collection: string;
  operation: string; // e.g., 'getDoc' | 'updateDoc' | 'addDoc' | 'onSnapshot'
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Measure execution latency of a Firestore async operation.
 * If Sentry is not initialized, passes through directly with zero overhead.
 */
export async function measureFirestore<T>(
  options: FirestoreSpanOptions,
  action: () => Promise<T>,
): Promise<T> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return action();
  }

  return Sentry.startSpan(
    {
      name: `Firestore: ${options.collection} [${options.operation}]`,
      op: options.op,
      attributes: {
        'db.system': 'firestore',
        'db.collection': options.collection,
        'db.operation': options.operation,
        ...options.metadata,
      },
    },
    async (span) => {
      try {
        const result = await action();
        span?.setStatus({ code: 1 }); // OK
        return result;
      } catch (err: any) {
        span?.setStatus({
          code: 2, // ERROR
          message: err?.code || err?.message || 'Firestore error',
        });
        throw err;
      }
    },
  );
}
```

### 7.3 Instrumenting Subscriptions (`onSnapshot`)
For realtime subscriptions in `packages/core/src/data/*` or `src/lib/contactQueries.ts`, measuring the initial data arrival latency is critical:
```typescript
import * as Sentry from '@sentry/react';

export function measureSubscriptionInitialLoad(
  collectionName: string,
  onFirstData: () => void,
): () => void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return () => {};
  }

  const startTime = Date.now();
  let completed = false;

  return () => {
    if (completed) return;
    completed = true;
    const durationMs = Date.now() - startTime;

    // Record as custom performance measurement or standalone span
    Sentry.startSpan(
      {
        name: `Firestore Subscription First Data: ${collectionName}`,
        op: 'db.subscribe',
        startTime: startTime / 1000,
        attributes: {
          'db.system': 'firestore',
          'db.collection': collectionName,
          'db.initial_latency_ms': durationMs,
        },
      },
      (span) => {
        span.end();
      },
    );
  };
}
```

### 7.4 Fail-Safe Testing Guarantees
- In all unit and component tests (`vitest run`), `import.meta.env.VITE_SENTRY_DSN` is undefined.
- All wrapper functions immediately bypass Sentry and execute the underlying function directly.
- No mocks of `@sentry/react` are strictly required for baseline tests, though Vitest can mock `@sentry/react` to assert span creation when testing telemetry explicitly.

---

## 8. Implementation Plan for Blocking Issue #1682

When executing [#1682](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1682) (*Instrument Sentry Performance on Web and PWA*), follow this sequence:

1. **Step 1: Install Dependencies**:
   Add `@sentry/react` to root `package.json`.
2. **Step 2: Create `src/lib/sentry.ts`**:
   Implement `initSentry`, `measureFirestore`, and privacy/scrubbing hooks.
3. **Step 3: Wire into Entrypoints**:
   Call `initSentry()` in `src/main.tsx`.
   Wrap `<Routes>` with `Sentry.withSentryReactRouterV7Routing(Routes)` in `src/App.tsx`.
4. **Step 4: Integrate Firestore Latency Spans**:
   Wrap key queries in `src/lib/contactQueries.ts`, `packages/core/src/data/contacts.ts`, and `src/lib/firebase.ts`.
5. **Step 5: Add Unit Tests**:
   Create `src/test/sentry.test.ts` to test initialization gating, span measurement error/success handling, and PII scrubbing rules.
6. **Step 6: Gate Verification**:
   Verify with `npm run typecheck && npm run lint && npm run test:coverage && npm run build`.
