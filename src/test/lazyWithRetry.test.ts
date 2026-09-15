import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { lazyWithRetry, isDynamicImportError } from '../lib/lazyWithRetry';

describe('lazyWithRetry & isDynamicImportError', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('isDynamicImportError', () => {
    it('identifies dynamic import error messages correctly', () => {
      expect(
        isDynamicImportError(
          new Error('Failed to fetch dynamically imported module: https://cisa-campus-work-tracker.pages.dev/assets/Messages-Bg_e6vmi.js')
        )
      ).toBe(true);

      expect(
        isDynamicImportError(new Error('Error loading dynamically imported module'))
      ).toBe(true);

      expect(
        isDynamicImportError(new Error('Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"'))
      ).toBe(true);

      expect(
        isDynamicImportError(new Error('Importing a module script failed.'))
      ).toBe(true);

      expect(isDynamicImportError(new Error('Standard network timeout'))).toBe(false);
      expect(isDynamicImportError(null)).toBe(false);
      expect(isDynamicImportError(undefined)).toBe(false);
    });
  });

  describe('lazyWithRetry component wrapper', () => {
    it('renders component successfully when dynamic import succeeds', async () => {
      const MockComponent = () => React.createElement('div', null, 'Loaded Component');
      const lazyComponent = lazyWithRetry(() => Promise.resolve({ default: MockComponent }));

      const { getByText } = render(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('div', null, 'Loading...') },
          React.createElement(lazyComponent)
        )
      );

      await waitFor(() => {
        expect(getByText('Loaded Component')).toBeDefined();
      });
    });

    it('triggers window.location.reload() when dynamic import fails and not previously reloaded', async () => {
      const reloadMock = vi.fn();
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...originalLocation,
        reload: reloadMock,
      } as Location);

      const importError = new TypeError(
        'Failed to fetch dynamically imported module: https://cisa-campus-work-tracker.pages.dev/assets/Messages-Bg_e6vmi.js'
      );

      const lazyComponent = lazyWithRetry(() => Promise.reject(importError));

      render(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('div', null, 'Loading...') },
          React.createElement(lazyComponent)
        )
      );

      await waitFor(() => {
        expect(sessionStorage.getItem('cisa_dynamic_import_reloaded')).toBe('true');
        expect(reloadMock).toHaveBeenCalledTimes(1);
      });
    });

    it('re-throws error if page was already reloaded in session', async () => {
      sessionStorage.setItem('cisa_dynamic_import_reloaded', 'true');

      const reloadMock = vi.fn();
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...originalLocation,
        reload: reloadMock,
      } as Location);

      const importError = new TypeError(
        'Failed to fetch dynamically imported module: https://cisa-campus-work-tracker.pages.dev/assets/Messages-Bg_e6vmi.js'
      );

      const lazyComponent = lazyWithRetry(() => Promise.reject(importError));

      class TestErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
        state = { error: null };
        static getDerivedStateFromError(error: Error) {
          return { error };
        }
        render() {
          if (this.state.error) {
            return React.createElement('div', null, (this.state.error as Error).message);
          }
          return this.props.children;
        }
      }

      const { getByText } = render(
        React.createElement(
          TestErrorBoundary,
          null,
          React.createElement(
            React.Suspense,
            { fallback: React.createElement('div', null, 'Loading...') },
            React.createElement(lazyComponent)
          )
        )
      );

      await waitFor(() => {
        expect(getByText(/Failed to fetch dynamically imported module/i)).toBeDefined();
        expect(reloadMock).not.toHaveBeenCalled();
      });
    });

    // Regression: Vite's __vitePreload swallows the underlying error when a
    // `vite:preloadError` listener calls preventDefault(), so the import
    // *resolves* with `undefined` instead of rejecting. Treating that as a
    // success cleared the anti-reload guard on every load, which turned a
    // single missing chunk into an endless reload loop.
    it('treats an import that resolves without a default export as a failed import', async () => {
      sessionStorage.setItem('cisa_dynamic_import_reloaded', 'true');

      const reloadMock = vi.fn();
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...originalLocation,
        reload: reloadMock,
      } as Location);

      const lazyComponent = lazyWithRetry(
        () => Promise.resolve(undefined) as unknown as Promise<{ default: React.ComponentType<any> }>
      );

      class TestErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
        state = { error: null };
        static getDerivedStateFromError(error: Error) {
          return { error };
        }
        render() {
          if (this.state.error) {
            return React.createElement('div', null, (this.state.error as Error).message);
          }
          return this.props.children;
        }
      }

      const { getByText } = render(
        React.createElement(
          TestErrorBoundary,
          null,
          React.createElement(
            React.Suspense,
            { fallback: React.createElement('div', null, 'Loading...') },
            React.createElement(lazyComponent)
          )
        )
      );

      await waitFor(() => {
        // The guard must survive, or the next load reloads again — forever.
        expect(sessionStorage.getItem('cisa_dynamic_import_reloaded')).toBe('true');
        expect(reloadMock).not.toHaveBeenCalled();
        // And the surfaced error must still read as a chunk error, so the
        // ErrorBoundary shows "A new version is available" rather than a
        // generic "Cannot read properties of undefined (reading 'default')".
        expect(isDynamicImportError((getByText(/./).textContent) as string)).toBe(true);
      });
    });

    it('reloads once when a preload-swallowed import resolves empty on a fresh session', async () => {
      const reloadMock = vi.fn();
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...originalLocation,
        reload: reloadMock,
      } as Location);

      const lazyComponent = lazyWithRetry(
        () => Promise.resolve(undefined) as unknown as Promise<{ default: React.ComponentType<any> }>
      );

      render(
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('div', null, 'Loading...') },
          React.createElement(lazyComponent)
        )
      );

      await waitFor(() => {
        expect(sessionStorage.getItem('cisa_dynamic_import_reloaded')).toBe('true');
        expect(reloadMock).toHaveBeenCalledTimes(1);
      });
    });
  });
});
