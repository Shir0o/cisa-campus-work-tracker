import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import * as Sentry from '@sentry/react';
import {
  initSentry,
  isSentryActive,
  setSentryUser,
  captureFirestoreError,
  measureFirestore,
  wrapRoutesWithSentry,
  buildSentryOptions,
} from '../lib/sentry';

describe('sentry (web & pwa telemetry)', () => {
  describe('when VITE_SENTRY_DSN is unset (inert mode)', () => {
    it('is not active by default', () => {
      // In testing environment without DSN
      expect(isSentryActive()).toBe(false);
    });

    it('setSentryUser is safe and does not throw', () => {
      expect(() => setSentryUser('user-123')).not.toThrow();
      expect(() => setSentryUser(null)).not.toThrow();
    });

    it('captureFirestoreError is safe and does not throw', () => {
      expect(() =>
        captureFirestoreError({
          error: 'permission-denied',
          operationType: 'read',
          path: 'contacts/123',
        })
      ).not.toThrow();
    });

    it('measureFirestore transparently executes and returns result', async () => {
      const result = await measureFirestore('getDoc', 'contacts/123', async () => {
        return { id: '123', name: 'John Doe' };
      });
      expect(result).toEqual({ id: '123', name: 'John Doe' });
    });

    it('measureFirestore transparently propagates rejections', async () => {
      await expect(
        measureFirestore('getDoc', 'contacts/123', async () => {
          throw new Error('network-failed');
        })
      ).rejects.toThrow('network-failed');
    });

    it('wrapRoutesWithSentry returns original component when inactive', () => {
      const DummyRoutes: React.FC = () => React.createElement('div', null, 'routes');
      const Wrapped = wrapRoutesWithSentry(DummyRoutes);
      expect(Wrapped).toBe(DummyRoutes);
    });
  });

  describe('privacy & compliance (AGENTS.md Rule 6)', () => {
    it('constructs options with zero-PII and scrubbing hooks', () => {
      const options = buildSentryOptions(
        'https://public@sentry.example.com/1',
        'production',
        'v1.0.0'
      );

      expect(options.dsn).toBe('https://public@sentry.example.com/1');
      expect(options.tracesSampleRate).toBe(0.2);
      expect(options.release).toBe('v1.0.0');

      // Test beforeBreadcrumb input scrubbing
      if (options.beforeBreadcrumb) {
        const clickBreadcrumb = {
          category: 'ui.click',
          data: { value: 'secret-input', text: 'secret-name', other: 'kept' },
        };
        const scrubbed = options.beforeBreadcrumb(clickBreadcrumb, {});
        expect(scrubbed?.data?.value).toBeUndefined();
        expect(scrubbed?.data?.text).toBeUndefined();
        expect(scrubbed?.data?.other).toBe('kept');
      }

      // Test beforeSend user PII stripping
      if (options.beforeSend) {
        const eventWithPii = {
          user: {
            id: 'opaque-uid-123',
            email: 'user@example.com',
            username: 'alice',
            ip_address: '1.2.3.4',
          },
        };
        const scrubbedEvent = options.beforeSend(eventWithPii as any, {}) as any;
        expect(scrubbedEvent?.user?.id).toBe('opaque-uid-123');
        expect(scrubbedEvent?.user?.email).toBeUndefined();
        expect(scrubbedEvent?.user?.username).toBeUndefined();
        expect(scrubbedEvent?.user?.ip_address).toBeUndefined();
      }
    });

    it('uses 100% traces sample rate in development environment', () => {
      const options = buildSentryOptions('https://public@sentry.example.com/1', 'development');
      expect(options.tracesSampleRate).toBe(1.0);
    });
  });
});
