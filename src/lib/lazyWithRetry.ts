import React from 'react';

/**
 * Utility function to check if an error is caused by a failed dynamic module import.
 * This typically happens when a new version of the app is deployed to static hosting (e.g. Cloudflare Pages)
 * and old chunk hashes are purged while a user has an active tab open.
 */
export function isDynamicImportError(error: unknown): boolean {
  if (!error) return false;
  const message = (error as Error)?.message || String(error);
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /failed to load module script/i.test(message) ||
    /importing a module script failed/i.test(message)
  );
}

/**
 * Wraps dynamic React component imports (`React.lazy(() => import(...))`) with automatic
 * retry and page reload logic when dynamic module chunks fail to fetch.
 * Uses sessionStorage to prevent infinite reload loops if a network failure persists.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const pageHasAlreadyBeenReloaded =
      typeof window !== 'undefined' &&
      window.sessionStorage?.getItem('cisa_dynamic_import_reloaded') === 'true';

    try {
      const component = await componentImport();
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('cisa_dynamic_import_reloaded');
      }
      return component;
    } catch (error: any) {
      if (isDynamicImportError(error) && !pageHasAlreadyBeenReloaded) {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('cisa_dynamic_import_reloaded', 'true');
          window.location.reload();
        }
        // Trigger the reload and then re-throw the error to ensure it propagates
        // if the reload is delayed or blocked, preventing a hanging suspense state.
        throw error;
      }

      throw error;
    }
  });
}
