// Sentry crash/error & performance telemetry for Mobile (Android & iOS).
// Wired but inert without a DSN: no EXPO_PUBLIC_SENTRY_DSN means nothing
// initializes and nothing is reported, so the app keeps working (and the test
// suite stays green) before a Sentry project exists.
//
// Complies with AGENTS.md Rule 6:
// - Zero session replay / video recording (CIPA / Wiretapping compliance)
// - Zero PII: sendDefaultPii=false, opaque Firebase UID only, no emails/usernames/IPs
// - Lazy require('@sentry/react-native') so importing never pulls native SDK in Jest or DSN-less runs
import type * as SentryModule from '@sentry/react-native';
import React from 'react';

let Sentry: typeof SentryModule | null = null;
let routingIntegrationInstance: any = null;

export interface MobileSentryOptions {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  enableAppStartTracking: boolean;
  enableNativeFramesTracking: boolean;
  enableStallTracking: boolean;
  enableUserInteractionTracking: boolean;
  sendDefaultPii: boolean;
  integrations?: any[];
  beforeBreadcrumb?: (breadcrumb: any, hint?: any) => any;
  beforeSend?: (event: any, hint?: any) => any;
}

/**
 * Pure builder for mobile Sentry configuration options.
 */
export function buildMobileSentryOptions(
  dsn: string,
  environment: string,
  isDev: boolean = false
): MobileSentryOptions {
  return {
    dsn,
    environment,
    tracesSampleRate: isDev ? 1.0 : 0.2,

    // App Start & Native Frame Tracking (TTID, Slow & Frozen frames, Hermes stall)
    enableAppStartTracking: true,
    enableNativeFramesTracking: true,
    enableStallTracking: true,
    enableUserInteractionTracking: true,

    // Privacy & compliance (AGENTS.md Rule 6)
    sendDefaultPii: false,

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'ui.click' || breadcrumb.category === 'ui.input') {
        if (breadcrumb.data) {
          delete breadcrumb.data.value;
          delete breadcrumb.data.text;
        }
      }
      return breadcrumb;
    },

    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  };
}

/** Call once at app start, before anything that could throw. */
export function initSentry(): void {
  if (Sentry) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  try {
    const mod = require('@sentry/react-native') as typeof SentryModule;
    const isDev = process.env.NODE_ENV === 'development';
    const env = process.env.EXPO_PUBLIC_APP_ENV || 'production';
    const options = buildMobileSentryOptions(dsn, env, isDev);

    if (typeof mod.reactNavigationIntegration === 'function') {
      routingIntegrationInstance = mod.reactNavigationIntegration({
        enableTimeToInitialDisplay: true,
      });
      options.integrations = [routingIntegrationInstance];
    }

    mod.init(options as any);
    Sentry = mod;
  } catch {
    Sentry = null;
    routingIntegrationInstance = null;
  }
}

/**
 * Register navigation container ref with Sentry for automatic screen transition transactions.
 */
export function registerNavigationRef(ref: any): void {
  if (routingIntegrationInstance && ref && typeof routingIntegrationInstance.registerNavigationContainer === 'function') {
    routingIntegrationInstance.registerNavigationContainer(ref);
  }
}

/**
 * Safe root layout wrapper.
 * Completes cold/warm app start tracing (app.start.cold) when Sentry is active.
 * Acts as a pure identity passthrough (Component => Component) when Sentry is inactive.
 */
export function wrapRootLayout<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  if (!Sentry) return Component;
  return Sentry.wrap(Component as any) as any;
}

/** Check if Sentry is currently active */
export function isSentryActive(): boolean {
  return Sentry !== null;
}

/** Set current authenticated user in Sentry (opaque UID only). */
export function setSentryUser(uid: string | null | undefined): void {
  if (!Sentry) return;
  if (uid) {
    Sentry.setUser({ id: uid });
  } else {
    Sentry.setUser(null);
  }
}

/** Report a Firestore operation failure that would otherwise only hit console. */
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
      userId: info.userId ?? '',
    },
  });
}

/**
 * Wraps an async Firestore query or mutation with a Sentry performance span on mobile.
 */
export async function measureFirestore<T>(
  operationType: string,
  pathOrQuery: string,
  fn: () =>
    Promise<T>
): Promise<T> {
  if (!Sentry) {
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
