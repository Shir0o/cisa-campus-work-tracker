// Dynamic import is intentional: the module constant must be re-evaluated
// per test with a different stubbed VITE_PUBLIC_APP_URL.
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('publicUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to the production domain, never the current location', async () => {
    const mod = await import('../lib/publicUrl');
    expect(mod.PUBLIC_APP_URL).toBe('https://cisa-campus-work-tracker.pages.dev');
    expect(mod.entryPointUrl('cisa-wednesday')).toBe(
      'https://cisa-campus-work-tracker.pages.dev/s/cisa-wednesday',
    );
  });

  it('honours VITE_PUBLIC_APP_URL and strips a trailing slash', async () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://cisa-campus-work-tracker-qa.pages.dev/');
    const mod = await import('../lib/publicUrl');
    expect(mod.PUBLIC_APP_URL).toBe('https://cisa-campus-work-tracker-qa.pages.dev');
    expect(mod.entryPointUrl('cisa-wednesday')).toBe(
      'https://cisa-campus-work-tracker-qa.pages.dev/s/cisa-wednesday',
    );
  });
});
