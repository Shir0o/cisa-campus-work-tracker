import { describe, it, expect } from 'vitest';
import { onRequest } from '../../functions/__/firebase/init.json';

// Issue #557 — the same-origin auth helper also fetches `__/firebase/init.json`
// from ITS OWN origin to learn the project config. On Firebase Hosting that file
// is generated automatically; here the Pages function answers it with the web
// app's own config so the helper can bootstrap same-origin.
describe('Cloudflare init.json (functions/__/firebase/init.json.ts)', () => {
  it('serves the project config with the app domain as authDomain', async () => {
    const response = await onRequest({ request: new Request('https://cisa-campus-work-traker.pages.dev/__/firebase/init.json'), env: {} } as any);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = await response.json();
    expect(body.projectId).toBe('sac-campus-hub');
    expect(body.authDomain).toBe('cisa-campus-work-traker.pages.dev');
    expect(body.apiKey).toBeTruthy();
  });

  it('honours the auth domain env override (QA host)', async () => {
    const response = await onRequest({
      request: new Request('https://cisa-campus-work-traker-qa.pages.dev/__/firebase/init.json'),
      env: { VITE_FIREBASE_AUTH_DOMAIN: 'cisa-campus-work-traker-qa.pages.dev' },
    } as any);
    const body = await response.json();
    expect(body.authDomain).toBe('cisa-campus-work-traker-qa.pages.dev');
  });
});