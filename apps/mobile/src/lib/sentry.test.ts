// The reporting layer is deliberately inert without a DSN — nothing initializes
// and nothing throws, so the app (and the test suite) works before a Sentry
// project exists. This locks that guard in.
import React from 'react';
import {
  initSentry,
  captureFirestoreError,
  isSentryActive,
  setSentryUser,
  measureFirestore,
  wrapRootLayout,
  buildMobileSentryOptions,
} from './sentry';

describe('sentry (mobile telemetry)', () => {
  const original = process.env.EXPO_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  afterEach(() => {
    if (original) process.env.EXPO_PUBLIC_SENTRY_DSN = original;
    else delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  describe('when EXPO_PUBLIC_SENTRY_DSN is unset (inert mode)', () => {
    it('initializing and capturing are no-ops and never throw', () => {
      expect(() => {
        initSentry();
        captureFirestoreError({ error: 'boom', operationType: 'list', path: 'contacts' });
      }).not.toThrow();
    });

    it('is not active by default in test suite', () => {
      expect(isSentryActive()).toBe(false);
    });

    it('wrapRootLayout returns component untouched', () => {
      const DummyLayout: React.FC = () => React.createElement('div', null, 'mobile-layout');
      const Wrapped = wrapRootLayout(DummyLayout);
      expect(Wrapped).toBe(DummyLayout);
    });

    it('setSentryUser does not throw when inert', () => {
      expect(() => setSentryUser('uid-456')).not.toThrow();
      expect(() => setSentryUser(null)).not.toThrow();
    });

    it('measureFirestore transparently executes and returns result', async () => {
      const result = await measureFirestore('listContacts', 'contacts', async () => {
        return ['contact-1', 'contact-2'];
      });
      expect(result).toEqual(['contact-1', 'contact-2']);
    });

    it('measureFirestore transparently propagates rejections', async () => {
      await expect(
        measureFirestore('writeVisit', 'visits', async () => {
          throw new Error('firestore-offline');
        })
      ).rejects.toThrow('firestore-offline');
    });
  });

  describe('privacy & compliance (AGENTS.md Rule 6)', () => {
    it('constructs options with frame tracking, stall tracking, and PII scrubbing', () => {
      const options = buildMobileSentryOptions(
        'https://public@sentry.example.com/2',
        'production',
        false
      );

      expect(options.dsn).toBe('https://public@sentry.example.com/2');
      expect(options.sendDefaultPii).toBe(false);
      expect(options.tracesSampleRate).toBe(0.2);
      expect(options.enableAppStartTracking).toBe(true);
      expect(options.enableNativeFramesTracking).toBe(true);
      expect(options.enableStallTracking).toBe(true);
      expect(options.enableUserInteractionTracking).toBe(true);

      // Verify beforeBreadcrumb input scrubbing
      if (options.beforeBreadcrumb) {
        const inputBreadcrumb = {
          category: 'ui.input',
          data: { value: 'confidential', text: 'phone-number', tag: 'kept' },
        };
        const scrubbed = options.beforeBreadcrumb(inputBreadcrumb);
        expect(scrubbed?.data?.value).toBeUndefined();
        expect(scrubbed?.data?.text).toBeUndefined();
        expect(scrubbed?.data?.tag).toBe('kept');
      }

      // Verify beforeSend user PII stripping
      if (options.beforeSend) {
        const eventWithPii = {
          user: {
            id: 'mobile-uid-789',
            email: 'student@campus.edu',
            username: 'student789',
            ip_address: '10.0.0.1',
          },
        };
        const scrubbedEvent = options.beforeSend(eventWithPii);
        expect(scrubbedEvent?.user?.id).toBe('mobile-uid-789');
        expect(scrubbedEvent?.user?.email).toBeUndefined();
        expect(scrubbedEvent?.user?.username).toBeUndefined();
        expect(scrubbedEvent?.user?.ip_address).toBeUndefined();
      }
    });

    it('uses 100% traces sample rate in development', () => {
      const options = buildMobileSentryOptions(
        'https://public@sentry.example.com/2',
        'development',
        true
      );
      expect(options.tracesSampleRate).toBe(1.0);
    });
  });
});
