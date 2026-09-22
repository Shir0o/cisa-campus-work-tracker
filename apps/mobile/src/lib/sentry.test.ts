// The reporting layer is deliberately inert without a DSN — nothing initializes
// and nothing throws, so the app (and the test suite) works before a Sentry
// project exists. This locks that guard in.
import { initSentry, captureFirestoreError } from './sentry';

describe('sentry (no DSN)', () => {
  const original = process.env.EXPO_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  afterEach(() => {
    if (original) process.env.EXPO_PUBLIC_SENTRY_DSN = original;
    else delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('initializing and capturing are no-ops and never throw', () => {
    expect(() => {
      initSentry();
      captureFirestoreError({ error: 'boom', operationType: 'list', path: 'contacts' });
    }).not.toThrow();
  });
});