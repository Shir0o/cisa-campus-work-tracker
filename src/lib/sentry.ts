// Sentry Performance & Error Monitoring for Web & PWA
// Complies with AGENTS.md Rule 6:
// - Zero session recording / replay scripts (CIPA / Wiretapping compliance)
// - Zero PII: sendDefaultPii=false, opaque Firebase UID only, no emails/usernames/IPs
// - Inert when VITE_SENTRY_DSN is unset (zero test/dev overhead)

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
 * Build Sentry client options ensuring strict AGENTS.md compliance.
 */
export function buildSentryOptions(
  dsn: string,
  environment: string,
  release?: string
): Sentry.BrowserOptions {
  return {
    dsn,
    environment,
    release,

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

    // Sampling rate: 100% in development (with DSN), 20% in production for quota discipline
    tracesSampleRate: environment === 'development' ? 1.0 : 0.2,

    // PII Scrubbing Hooks
    beforeBreadcrumb(breadcrumb) {
      // Strip sensitive user input values from UI click/input breadcrumbs
      if (breadcrumb.category === 'ui.click' || breadcrumb.category === 'ui.input') {
        if (breadcrumb.data) {
          delete breadcrumb.data.value;
          delete breadcrumb.data.text;
        }
      }
      return breadcrumb;
    },

    beforeSend(event) {
      // Guarantee user context is limited to opaque UID (never emails or names)
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  };
}

/**
 * Initialize Sentry for Web & PWA.
 * Safe to call multiple times; no-op if VITE_SENTRY_DSN is unset.
 */
export function initSentry(): void {
  if (isInitialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    const options = buildSentryOptions(
      dsn,
      import.meta.env.MODE || 'production',
      import.meta.env.VITE_APP_VERSION
    );
    Sentry.init(options);
    isInitialized = true;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to initialize Sentry:', err);
    }
  }
}

/** Check if Sentry is currently active */
export function isSentryActive(): boolean {
  return isInitialized;
}

/**
 * Set current authenticated user in Sentry (opaque UID only).
 */
export function setSentryUser(uid: string | null | undefined): void {
  if (!isInitialized) return;
  if (uid) {
    Sentry.setUser({ id: uid });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Report a Firestore operation failure to Sentry.
 * Mirrors apps/mobile/src/lib/sentry.ts for cross-platform parity.
 */
export function captureFirestoreError(info: {
  error: string;
  operationType: string;
  path: string | null;
  userId?: string | null | undefined;
}): void {
  if (!isInitialized) return;
  Sentry.captureException(new Error(info.error), {
    tags: {
      operationType: info.operationType,
      path: info.path ?? '',
      userId: info.userId ?? '',
    },
  });
}

/**
 * Wraps an async Firestore query or mutation with a Sentry performance span.
 */
export async function measureFirestore<T>(
  operationType: string,
  pathOrQuery: string,
  fn: () =>
    Promise<T>
): Promise<T> {
  if (!isInitialized) {
    return fn();
  }

  return Sentry.startSpan(
    {
      name: `firestore.${operationType}`,
      op: 'db.firestore',
      attributes: {
        'db.operation': operationType,
        'db.collection': pathOrQuery,
      },
    },
    async () => fn()
  );
}

/**
 * Wraps React Router's Routes component with Sentry routing instrumentation.
 */
export function wrapRoutesWithSentry<P extends object>(
  RoutesComponent: React.ComponentType<P>
): React.ComponentType<P> {
  // If Sentry is not initialized, return original Routes without wrapping
  if (!isInitialized) {
    return RoutesComponent;
  }
  const routed = Sentry.withSentryReactRouterV7Routing(
    RoutesComponent as unknown as React.FC<Record<string, unknown>>
  );
  return routed as unknown as React.ComponentType<P>;
}
