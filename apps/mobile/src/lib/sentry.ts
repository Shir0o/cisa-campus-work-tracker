// Sentry crash/error reporting — the "catch it early" half of the monitoring
// story. Wired but inert without a DSN: no EXPO_PUBLIC_SENTRY_DSN means nothing
// initializes and nothing is reported, so the app keeps working (and the test
// suite stays green) before a Sentry project exists.
//
// @sentry/react-native is required lazily so importing this module never pulls
// the native SDK into a jest run or a DSN-less bundle.
import type * as SentryModule from '@sentry/react-native';

let Sentry: typeof SentryModule | null = null;

/** Call once at app start, before anything that could throw. */
export function initSentry(): void {
  if (Sentry) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const mod = require('@sentry/react-native') as typeof SentryModule;
    mod.init({
      dsn,
      environment: process.env.EXPO_PUBLIC_APP_ENV || 'production',
      // Errors are the point; a light transaction sample keeps quotas sane.
      tracesSampleRate: 0.2,
    });
    Sentry = mod;
  } catch {
    Sentry = null;
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